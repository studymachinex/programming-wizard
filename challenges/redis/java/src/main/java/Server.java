import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * O servidor: aceita conexões (uma thread por cliente) e executa os comandos sob um lock
 * global — simples e suficiente para o desafio. Comandos bloqueantes (BLPOP, XREAD BLOCK,
 * WAIT) esperam com LOCK.wait(), que libera o lock enquanto esperam.
 */
final class Server {
  static final Set<String> WRITE_COMMANDS = Set.of(
      "SET", "DEL", "INCR", "RPUSH", "LPUSH", "LPOP", "XADD", "ZADD", "ZREM", "SETBIT", "BITOP", "GEOADD");
  static final Set<String> SUBSCRIBED_ALLOWED = Set.of("SUBSCRIBE", "UNSUBSCRIBE", "PSUBSCRIBE", "PUNSUBSCRIBE", "PING", "QUIT", "RESET");

  final Object lock = new Object();
  final Main.Config config;
  final Store store = new Store();
  final String replId = randomId();
  long masterOffset = 0;
  final List<Session> replicas = new CopyOnWriteArrayList<>();
  final Map<String, Set<Session>> channels = new HashMap<>();
  final Map<String, Set<String>> userPasswords = new HashMap<>(Map.of("default", new LinkedHashSet<>()));
  /** Fila de clientes bloqueados por chave (BLPOP é atendido em ordem de chegada). */
  final Map<String, ArrayDeque<Object>> listWaiters = new HashMap<>();
  private Path aofFile;
  boolean isReplica;

  Server(Main.Config config) {
    this.config = config;
  }

  void start() throws IOException {
    loadRdb();
    openAof();
    ServerSocket serverSocket = new ServerSocket();
    serverSocket.setReuseAddress(true);
    serverSocket.bind(new InetSocketAddress(config.port));
    if (config.replicaOf != null) {
      isReplica = true;
      String[] parts = config.replicaOf.trim().split("\\s+");
      Thread replica = new Thread(new Replica(this, parts[0], Integer.parseInt(parts[1])), "replica");
      replica.setDaemon(true);
      replica.start();
    }
    while (true) {
      Socket socket = serverSocket.accept();
      socket.setTcpNoDelay(true);
      Thread thread = new Thread(new Session(this, socket));
      thread.setDaemon(true);
      thread.start();
    }
  }

  // ---------------------------------------------------------------- sessões

  /** Uma conexão de cliente (ou de réplica, depois do PSYNC). */
  static final class Session implements Runnable {
    final Server server;
    final Socket socket;
    private final OutputStream out;
    boolean authenticated;
    String user = "default";
    boolean inMulti;
    boolean multiAborted;
    final List<List<String>> queued = new ArrayList<>();
    final Map<String, Long> watched = new HashMap<>();
    final Set<String> subscriptions = new LinkedHashSet<>();
    boolean isReplicaLink;
    long ackOffset;

    Session(Server server, Socket socket) throws IOException {
      this.server = server;
      this.socket = socket;
      this.out = socket == null ? OutputStream.nullOutputStream() : socket.getOutputStream();
      synchronized (server.lock) {
        authenticated = server.userPasswords.get("default").isEmpty();
      }
    }

    @Override
    public void run() {
      try (socket) {
        Resp.Reader reader = new Resp.Reader(new BufferedInputStream(socket.getInputStream()));
        while (true) {
          List<String> command = reader.readCommand();
          if (command == null || command.isEmpty()) break;
          byte[] reply = server.handle(this, command);
          if (reply != null) send(reply);
        }
      } catch (IOException ignored) {
        // cliente desconectou
      } finally {
        synchronized (server.lock) {
          server.replicas.remove(this);
          for (String channel : subscriptions) {
            Set<Session> subscribers = server.channels.get(channel);
            if (subscribers != null) subscribers.remove(this);
          }
        }
      }
    }

    void send(byte[] data) {
      synchronized (out) {
        try {
          out.write(data);
          out.flush();
        } catch (IOException ignored) {
          // a conexão caiu; o loop de leitura encerra a sessão
        }
      }
    }
  }

  // ------------------------------------------------------------- despacho

  /** Trata um comando de um cliente: autenticação, modo inscrito e transações. */
  byte[] handle(Session session, List<String> command) {
    String name = command.get(0).toUpperCase(Locale.ROOT);
    synchronized (lock) {
      if (!session.authenticated && !name.equals("AUTH")) return Resp.error("NOAUTH Authentication required.");
      if (!session.subscriptions.isEmpty() && !SUBSCRIBED_ALLOWED.contains(name)) {
        return Resp.error("ERR Can't execute '" + name.toLowerCase(Locale.ROOT)
            + "': only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context");
      }
      if (session.inMulti && !Set.of("EXEC", "DISCARD", "MULTI", "WATCH").contains(name)) {
        if (!knownCommand(name)) {
          session.multiAborted = true;
          return Resp.error("ERR unknown command '" + command.get(0) + "'");
        }
        session.queued.add(command);
        return Resp.simple("QUEUED");
      }
      return switch (name) {
        case "MULTI" -> {
          if (session.inMulti) yield Resp.error("ERR MULTI calls can not be nested");
          session.inMulti = true;
          session.multiAborted = false;
          session.queued.clear();
          yield Resp.simple("OK");
        }
        case "EXEC" -> exec(session);
        case "DISCARD" -> {
          if (!session.inMulti) yield Resp.error("ERR DISCARD without MULTI");
          session.inMulti = false;
          session.queued.clear();
          session.watched.clear();
          yield Resp.simple("OK");
        }
        case "WATCH" -> {
          if (session.inMulti) yield Resp.error("ERR WATCH inside MULTI is not allowed");
          for (String key : command.subList(1, command.size())) session.watched.putIfAbsent(key, store.version(key));
          yield Resp.simple("OK");
        }
        case "UNWATCH" -> {
          session.watched.clear();
          yield Resp.simple("OK");
        }
        default -> execute(session, command, false);
      };
    }
  }

  private byte[] exec(Session session) {
    if (!session.inMulti) return Resp.error("ERR EXEC without MULTI");
    session.inMulti = false;
    List<List<String>> commands = new ArrayList<>(session.queued);
    session.queued.clear();
    boolean aborted = session.multiAborted;
    boolean dirty = false;
    for (Map.Entry<String, Long> entry : session.watched.entrySet()) {
      if (store.version(entry.getKey()) != entry.getValue()) dirty = true;
    }
    session.watched.clear();
    if (aborted) return Resp.error("EXECABORT Transaction discarded because of previous errors.");
    if (dirty) return Resp.nullArray();
    List<byte[]> replies = new ArrayList<>();
    for (List<String> command : commands) replies.add(execute(session, command, false));
    return Resp.array(replies);
  }

  /**
   * Executa um comando (já com o lock). `replicated`: veio do master ou do AOF — não é
   * propagado nem gravado de novo.
   */
  byte[] execute(Session session, List<String> command, boolean replicated) {
    String name = command.get(0).toUpperCase(Locale.ROOT);
    byte[] reply;
    try {
      reply = Commands.run(this, session, name, command.subList(1, command.size()));
    } catch (Commands.CommandError e) {
      reply = Resp.error(e.getMessage());
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      reply = Resp.error("ERR interrupted");
    }
    if (!replicated && WRITE_COMMANDS.contains(name) && reply != null && reply[0] != '-') {
      propagate(command);
      appendAof(command);
    }
    return reply;
  }

  static boolean knownCommand(String name) {
    return Commands.KNOWN.contains(name);
  }

  // ----------------------------------------------------------- replicação

  void propagate(List<String> command) {
    byte[] data = Resp.command(command);
    masterOffset += data.length;
    for (Session replica : replicas) replica.send(data);
  }

  /** WAIT: quantas réplicas confirmaram ter processado tudo até agora. */
  byte[] waitReplicas(int needed, long timeoutMs) throws InterruptedException {
    if (masterOffset == 0) return Resp.integer(replicas.size());
    long target = masterOffset;
    byte[] getAck = Resp.command(List.of("REPLCONF", "GETACK", "*"));
    for (Session replica : replicas) replica.send(getAck);
    masterOffset += getAck.length;
    long deadline = System.currentTimeMillis() + timeoutMs;
    while (true) {
      int acked = 0;
      for (Session replica : replicas) if (replica.ackOffset >= target) acked++;
      long remaining = deadline - System.currentTimeMillis();
      if (acked >= needed || remaining <= 0) return Resp.integer(acked);
      lock.wait(remaining);
    }
  }

  byte[] info(String section) {
    StringBuilder text = new StringBuilder("# Replication\r\n");
    text.append("role:").append(isReplica ? "slave" : "master").append("\r\n");
    text.append("master_replid:").append(replId).append("\r\n");
    text.append("master_repl_offset:").append(masterOffset);
    return Resp.bulk(text.toString());
  }

  private static String randomId() {
    String alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
    SecureRandom random = new SecureRandom();
    StringBuilder id = new StringBuilder();
    for (int i = 0; i < 40; i++) id.append(alphabet.charAt(random.nextInt(alphabet.length())));
    return id.toString();
  }

  // ----------------------------------------------------------- persistência

  private void loadRdb() {
    Path file = Path.of(config.dir, config.dbFilename);
    if (!Files.isRegularFile(file)) return;
    try (InputStream in = Files.newInputStream(file)) {
      long now = System.currentTimeMillis();
      for (Rdb.Entry entry : Rdb.read(new BufferedInputStream(in))) {
        if (entry.expiresAtMs() < 0) store.put(entry.key(), new Store.Str(entry.value()));
        else if (entry.expiresAtMs() > now) store.putWithExpiry(entry.key(), new Store.Str(entry.value()), entry.expiresAtMs());
      }
    } catch (IOException e) {
      System.err.println("não consegui ler o RDB: " + e.getMessage());
    }
  }

  private void openAof() throws IOException {
    if (!config.appendOnly.equalsIgnoreCase("yes")) return;
    Path dir = Path.of(config.dir, config.appendDirName);
    Files.createDirectories(dir);
    Path manifest = dir.resolve(config.appendFilename + ".manifest");
    if (Files.isRegularFile(manifest)) {
      String incr = null;
      for (String line : Files.readAllLines(manifest, Resp.BYTES)) {
        String[] parts = line.trim().split("\\s+");
        if (parts.length >= 6 && parts[0].equals("file") && parts[5].equals("i")) incr = parts[1];
      }
      if (incr != null) {
        aofFile = dir.resolve(incr);
        replayAof();
        return;
      }
    }
    String incrName = config.appendFilename + ".1.incr.aof";
    aofFile = dir.resolve(incrName);
    if (!Files.exists(aofFile)) Files.createFile(aofFile);
    Files.writeString(manifest, "file " + incrName + " seq 1 type i\n", Resp.BYTES);
  }

  private void replayAof() throws IOException {
    if (!Files.isRegularFile(aofFile)) {
      Files.createFile(aofFile);
      return;
    }
    Session system = new Session(this, null);
    system.authenticated = true;
    try (InputStream in = new BufferedInputStream(Files.newInputStream(aofFile))) {
      Resp.Reader reader = new Resp.Reader(in);
      List<String> command;
      while ((command = reader.readCommand()) != null) {
        synchronized (lock) {
          execute(system, command, true);
        }
      }
    }
  }

  private void appendAof(List<String> command) {
    if (aofFile == null) return;
    try {
      Files.write(aofFile, Resp.command(command), StandardOpenOption.APPEND);
    } catch (IOException e) {
      System.err.println("falha ao gravar o AOF: " + e.getMessage());
    }
  }

  // ------------------------------------------------------------------ pub/sub

  byte[] subscribe(Session session, List<String> names) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    for (String channel : names) {
      session.subscriptions.add(channel);
      channels.computeIfAbsent(channel, c -> new LinkedHashSet<>()).add(session);
      out.writeBytes(Resp.array(Resp.bulk("subscribe"), Resp.bulk(channel), Resp.integer(session.subscriptions.size())));
    }
    return out.toByteArray();
  }

  byte[] unsubscribe(Session session, List<String> names) {
    List<String> targets = names.isEmpty() ? new ArrayList<>(session.subscriptions) : names;
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    for (String channel : targets) {
      session.subscriptions.remove(channel);
      Set<Session> subscribers = channels.get(channel);
      if (subscribers != null) subscribers.remove(session);
      out.writeBytes(Resp.array(Resp.bulk("unsubscribe"), Resp.bulk(channel), Resp.integer(session.subscriptions.size())));
    }
    return out.toByteArray();
  }

  int publish(String channel, String message) {
    Set<Session> subscribers = channels.getOrDefault(channel, Set.of());
    byte[] data = Resp.array(Resp.bulk("message"), Resp.bulk(channel), Resp.bulk(message));
    for (Session subscriber : subscribers) subscriber.send(data);
    return subscribers.size();
  }

  // ------------------------------------------------------------------- ACL

  static String sha256(String password) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(password.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  // ------------------------------------------------------------------ apoio

  /** Score como o Redis mostra: sem ".0" e sem notação científica. */
  static String formatDouble(double value) {
    if (value == Math.rint(value) && Math.abs(value) < 1e17) return String.valueOf((long) value);
    return new BigDecimal(Double.toString(value)).stripTrailingZeros().toPlainString();
  }

  static TreeSet<String> sorted(Set<String> values) {
    return new TreeSet<>(values);
  }

  static Map<String, String> pairs(List<String> values) {
    Map<String, String> map = new LinkedHashMap<>();
    for (int i = 0; i + 1 < values.size(); i += 2) map.put(values.get(i), values.get(i + 1));
    return map;
  }

  static Set<String> setOf(String... values) {
    return new HashSet<>(List.of(values));
  }
}
