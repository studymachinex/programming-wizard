import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.zip.DataFormatException;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;
import java.util.zip.Inflater;

/**
 * Implementação de referência do desafio "Build your own Git" (7 stages).
 *
 * Comandos: init, cat-file, hash-object, ls-tree, write-tree, commit-tree e clone.
 */
public class Main {
  private static final PrintStream OUT = System.out;

  public static void main(String[] args) throws Exception {
    if (args.length == 0) {
      System.err.println("uso: your_program.sh <comando> [<args>...]");
      System.exit(1);
    }

    Path cwd = Path.of("").toAbsolutePath();
    switch (args[0]) {
      case "init" -> {
        init(cwd.resolve(".git"), "main");
        OUT.println("Initialized git directory");
      }
      case "cat-file" -> catFile(gitDir(cwd), args);
      case "hash-object" -> hashObject(gitDir(cwd), args);
      case "ls-tree" -> lsTree(gitDir(cwd), args);
      case "write-tree" -> OUT.println(writeTree(gitDir(cwd), cwd));
      case "commit-tree" -> commitTree(gitDir(cwd), args);
      case "clone" -> clone(args, cwd);
      default -> {
        System.err.println("Unknown command: " + args[0]);
        System.exit(1);
      }
    }
    OUT.flush();
  }

  // ---------------------------------------------------------------- init

  static void init(Path git, String branch) throws IOException {
    Files.createDirectories(git.resolve("objects"));
    Files.createDirectories(git.resolve("refs").resolve("heads"));
    Files.createDirectories(git.resolve("refs").resolve("tags"));
    Files.writeString(git.resolve("HEAD"), "ref: refs/heads/" + branch + "\n");
  }

  static Path gitDir(Path cwd) {
    return cwd.resolve(".git");
  }

  // ------------------------------------------------------------- objects

  record GitObject(String type, byte[] data) {}

  static String sha1Hex(byte[] bytes) throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(bytes));
  }

  static byte[] frame(String type, byte[] content) {
    byte[] header = (type + " " + content.length + "\0").getBytes(StandardCharsets.UTF_8);
    byte[] full = new byte[header.length + content.length];
    System.arraycopy(header, 0, full, 0, header.length);
    System.arraycopy(content, 0, full, header.length, content.length);
    return full;
  }

  static String hashOf(String type, byte[] content) throws Exception {
    return sha1Hex(frame(type, content));
  }

  static String writeObject(Path git, String type, byte[] content) throws Exception {
    byte[] full = frame(type, content);
    String sha = sha1Hex(full);
    Path file = objectPath(git, sha);
    if (!Files.exists(file)) {
      Files.createDirectories(file.getParent());
      ByteArrayOutputStream compressed = new ByteArrayOutputStream();
      try (DeflaterOutputStream deflate = new DeflaterOutputStream(compressed, new Deflater())) {
        deflate.write(full);
      }
      Files.write(file, compressed.toByteArray());
    }
    return sha;
  }

  static Path objectPath(Path git, String sha) {
    return git.resolve("objects").resolve(sha.substring(0, 2)).resolve(sha.substring(2));
  }

  static GitObject readObject(Path git, String sha) throws Exception {
    Path file = objectPath(git, sha);
    if (!Files.exists(file)) throw new IllegalArgumentException("Not a valid object name " + sha);
    byte[] raw = inflate(Files.readAllBytes(file));
    int space = indexOf(raw, (byte) ' ', 0);
    int nul = indexOf(raw, (byte) 0, space);
    String type = new String(raw, 0, space, StandardCharsets.UTF_8);
    int size = Integer.parseInt(new String(raw, space + 1, nul - space - 1, StandardCharsets.UTF_8));
    byte[] data = new byte[size];
    System.arraycopy(raw, nul + 1, data, 0, size);
    return new GitObject(type, data);
  }

  static byte[] inflate(byte[] compressed) throws DataFormatException {
    Inflater inflater = new Inflater();
    inflater.setInput(compressed);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    while (!inflater.finished()) {
      int n = inflater.inflate(buffer);
      if (n == 0 && (inflater.needsInput() || inflater.needsDictionary())) break;
      out.write(buffer, 0, n);
    }
    inflater.end();
    return out.toByteArray();
  }

  static int indexOf(byte[] bytes, byte value, int from) {
    for (int i = from; i < bytes.length; i++) if (bytes[i] == value) return i;
    return -1;
  }

  // ------------------------------------------------- cat-file / hash-object

  static void catFile(Path git, String[] args) throws Exception {
    if (args.length < 3) throw new IllegalArgumentException("uso: cat-file (-p|-t|-s) <sha>");
    GitObject object = readObject(git, args[2]);
    switch (args[1]) {
      case "-t" -> OUT.println(object.type());
      case "-s" -> OUT.println(object.data().length);
      case "-p" -> {
        if (object.type().equals("tree")) {
          for (TreeEntry entry : parseTree(object.data())) {
            String type = entry.mode().equals("40000") ? "tree" : "blob";
            String mode = entry.mode().length() < 6 ? "0" + entry.mode() : entry.mode();
            OUT.println(mode + " " + type + " " + entry.sha() + "\t" + entry.name());
          }
        } else {
          OUT.write(object.data());
        }
      }
      default -> throw new IllegalArgumentException("flag desconhecida: " + args[1]);
    }
  }

  static void hashObject(Path git, String[] args) throws Exception {
    boolean write = false;
    String file = null;
    for (int i = 1; i < args.length; i++) {
      if (args[i].equals("-w")) write = true;
      else file = args[i];
    }
    if (file == null) throw new IllegalArgumentException("uso: hash-object [-w] <arquivo>");
    byte[] content = Files.readAllBytes(Path.of(file));
    OUT.println(write ? writeObject(git, "blob", content) : hashOf("blob", content));
  }

  // ------------------------------------------------------------- trees

  record TreeEntry(String mode, String name, String sha) {}

  static List<TreeEntry> parseTree(byte[] data) {
    List<TreeEntry> entries = new ArrayList<>();
    int i = 0;
    while (i < data.length) {
      int space = indexOf(data, (byte) ' ', i);
      int nul = indexOf(data, (byte) 0, space);
      String mode = new String(data, i, space - i, StandardCharsets.UTF_8);
      String name = new String(data, space + 1, nul - space - 1, StandardCharsets.UTF_8);
      byte[] raw = new byte[20];
      System.arraycopy(data, nul + 1, raw, 0, 20);
      entries.add(new TreeEntry(mode, name, HexFormat.of().formatHex(raw)));
      i = nul + 21;
    }
    return entries;
  }

  static void lsTree(Path git, String[] args) throws Exception {
    boolean nameOnly = false;
    String sha = null;
    for (int i = 1; i < args.length; i++) {
      if (args[i].equals("--name-only")) nameOnly = true;
      else sha = args[i];
    }
    if (sha == null) throw new IllegalArgumentException("uso: ls-tree [--name-only] <tree_sha>");
    GitObject object = readObject(git, sha);
    if (!object.type().equals("tree")) throw new IllegalArgumentException("not a tree object");
    for (TreeEntry entry : parseTree(object.data())) {
      if (nameOnly) {
        OUT.println(entry.name());
      } else {
        String type = entry.mode().equals("40000") ? "tree" : "blob";
        String mode = entry.mode().length() < 6 ? "0" + entry.mode() : entry.mode();
        OUT.println(mode + " " + type + " " + entry.sha() + "\t" + entry.name());
      }
    }
  }

  /** Grava a árvore de {@code dir} e devolve o SHA, ou null se ela ficaria vazia. */
  static String writeTree(Path git, Path dir) throws Exception {
    List<Path> children;
    try (var stream = Files.list(dir)) {
      children = new ArrayList<>(stream.toList());
    }
    // O git ordena diretórios como se o nome terminasse em "/".
    children.sort((a, b) -> sortKey(a).compareTo(sortKey(b)));

    ByteArrayOutputStream tree = new ByteArrayOutputStream();
    for (Path child : children) {
      String name = child.getFileName().toString();
      if (name.equals(".git")) continue;
      String mode;
      String sha;
      if (Files.isDirectory(child, LinkOption.NOFOLLOW_LINKS)) {
        sha = writeTree(git, child);
        if (sha == null) continue;
        mode = "40000";
      } else if (Files.isRegularFile(child, LinkOption.NOFOLLOW_LINKS)) {
        sha = writeObject(git, "blob", Files.readAllBytes(child));
        mode = isExecutable(child) ? "100755" : "100644";
      } else {
        continue;
      }
      tree.write((mode + " " + name + "\0").getBytes(StandardCharsets.UTF_8));
      tree.write(HexFormat.of().parseHex(sha));
    }
    if (tree.size() == 0) return null;
    return writeObject(git, "tree", tree.toByteArray());
  }

  static String sortKey(Path path) {
    String name = path.getFileName().toString();
    return Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS) ? name + "/" : name;
  }

  static boolean isExecutable(Path path) {
    try {
      return Files.getPosixFilePermissions(path).contains(PosixFilePermission.OWNER_EXECUTE);
    } catch (UnsupportedOperationException | IOException error) {
      return false; // Windows: o git usa core.filemode=false e grava 100644.
    }
  }

  // ------------------------------------------------------------- commits

  static void commitTree(Path git, String[] args) throws Exception {
    String tree = args.length > 1 ? args[1] : null;
    List<String> parents = new ArrayList<>();
    String message = null;
    for (int i = 2; i < args.length; i++) {
      if (args[i].equals("-p") && i + 1 < args.length) parents.add(args[++i]);
      else if (args[i].equals("-m") && i + 1 < args.length) message = args[++i];
    }
    if (tree == null || message == null) {
      throw new IllegalArgumentException("uso: commit-tree <tree_sha> [-p <commit_sha>] -m <mensagem>");
    }

    long now = System.currentTimeMillis() / 1000;
    String identity = "Programming Wizard <wizard@programming.local> " + now + " +0000";
    StringBuilder body = new StringBuilder();
    body.append("tree ").append(tree).append('\n');
    for (String parent : parents) body.append("parent ").append(parent).append('\n');
    body.append("author ").append(identity).append('\n');
    body.append("committer ").append(identity).append('\n');
    body.append('\n').append(message).append('\n');
    OUT.println(writeObject(git, "commit", body.toString().getBytes(StandardCharsets.UTF_8)));
  }

  // --------------------------------------------------------------- clone

  static void clone(String[] args, Path cwd) throws Exception {
    if (args.length < 3) throw new IllegalArgumentException("uso: clone <url> <diretório>");
    String url = args[1].replaceAll("/+$", "");
    Path target = cwd.resolve(args[2]);
    Files.createDirectories(target);
    Path git = target.resolve(".git");

    HttpClient http = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NORMAL)
        .connectTimeout(Duration.ofSeconds(10))
        .build();

    // 1. Descobre as refs (smart HTTP, protocolo v0).
    HttpResponse<byte[]> refsResponse = http.send(
        HttpRequest.newBuilder(URI.create(url + "/info/refs?service=git-upload-pack")).GET().build(),
        HttpResponse.BodyHandlers.ofByteArray());
    if (refsResponse.statusCode() != 200) {
      throw new IOException("info/refs respondeu " + refsResponse.statusCode());
    }
    Refs refs = parseRefs(refsResponse.body());
    if (refs.head == null) throw new IOException("repositório remoto sem HEAD");

    // 2. Pede o packfile com todos os objetos alcançáveis a partir de HEAD.
    ByteArrayOutputStream request = new ByteArrayOutputStream();
    request.write(pktLine("want " + refs.head + " ofs-delta\n"));
    request.write("0000".getBytes(StandardCharsets.US_ASCII));
    request.write(pktLine("done\n"));
    HttpResponse<byte[]> packResponse = http.send(
        HttpRequest.newBuilder(URI.create(url + "/git-upload-pack"))
            .header("Content-Type", "application/x-git-upload-pack-request")
            .header("Accept", "application/x-git-upload-pack-result")
            .POST(HttpRequest.BodyPublishers.ofByteArray(request.toByteArray()))
            .build(),
        HttpResponse.BodyHandlers.ofByteArray());
    if (packResponse.statusCode() != 200) {
      throw new IOException("git-upload-pack respondeu " + packResponse.statusCode());
    }

    // 3. Desempacota os objetos para .git/objects.
    init(git, refs.branch);
    unpack(git, packResponse.body());

    // 4. Atualiza a ref e faz checkout da árvore do commit.
    Path ref = git.resolve("refs").resolve("heads").resolve(refs.branch);
    Files.createDirectories(ref.getParent());
    Files.writeString(ref, refs.head + "\n");

    GitObject commit = readObject(git, refs.head);
    String commitText = new String(commit.data(), StandardCharsets.UTF_8);
    String treeSha = commitText.lines().findFirst().orElseThrow().substring("tree ".length());
    checkout(git, treeSha, target);
  }

  static final class Refs {
    String head;
    String branch = "main";
  }

  static Refs parseRefs(byte[] body) {
    Refs refs = new Refs();
    String symref = null;
    Map<String, String> byName = new HashMap<>();
    int pos = 0;
    while (pos + 4 <= body.length) {
      int length = Integer.parseInt(new String(body, pos, 4, StandardCharsets.US_ASCII), 16);
      if (length == 0) {
        pos += 4;
        continue;
      }
      String line = new String(body, pos + 4, length - 4, StandardCharsets.UTF_8).replaceAll("\n$", "");
      pos += length;
      if (line.startsWith("#")) continue;
      String capabilities = "";
      int nul = line.indexOf('\0');
      if (nul >= 0) {
        capabilities = line.substring(nul + 1);
        line = line.substring(0, nul);
      }
      for (String capability : capabilities.split(" ")) {
        if (capability.startsWith("symref=HEAD:")) symref = capability.substring("symref=HEAD:".length());
      }
      String[] parts = line.split(" ", 2);
      if (parts.length == 2) byName.put(parts[1], parts[0]);
    }

    refs.head = byName.get("HEAD");
    if (symref != null) {
      refs.branch = symref.replaceFirst("^refs/heads/", "");
      refs.head = byName.getOrDefault(symref, refs.head);
    } else if (refs.head != null) {
      for (Map.Entry<String, String> entry : byName.entrySet()) {
        if (entry.getKey().startsWith("refs/heads/") && entry.getValue().equals(refs.head)) {
          refs.branch = entry.getKey().substring("refs/heads/".length());
          break;
        }
      }
    }
    return refs;
  }

  static byte[] pktLine(String line) {
    byte[] payload = line.getBytes(StandardCharsets.UTF_8);
    String length = String.format("%04x", payload.length + 4);
    byte[] out = new byte[payload.length + 4];
    System.arraycopy(length.getBytes(StandardCharsets.US_ASCII), 0, out, 0, 4);
    System.arraycopy(payload, 0, out, 4, payload.length);
    return out;
  }

  record PackEntry(int type, byte[] data, String baseSha, long baseOffset) {}

  static final String[] TYPE_NAMES = {null, "commit", "tree", "blob", "tag"};

  static void unpack(Path git, byte[] response) throws Exception {
    int start = -1;
    for (int i = 0; i + 4 <= response.length; i++) {
      if (response[i] == 'P' && response[i + 1] == 'A' && response[i + 2] == 'C' && response[i + 3] == 'K') {
        start = i;
        break;
      }
    }
    if (start < 0) throw new IOException("resposta sem packfile");

    int pos = start + 8; // "PACK" + versão
    int count = readInt32(response, pos);
    pos += 4;

    Map<Long, PackEntry> byOffset = new HashMap<>();
    List<Long> order = new ArrayList<>();
    for (int n = 0; n < count; n++) {
      long objectOffset = pos;
      int b = response[pos++] & 0xff;
      int type = (b >> 4) & 7;
      long size = b & 0x0f;
      int shift = 4;
      while ((b & 0x80) != 0) {
        b = response[pos++] & 0xff;
        size |= (long) (b & 0x7f) << shift;
        shift += 7;
      }

      String baseSha = null;
      long baseOffset = -1;
      if (type == 6) { // OFS_DELTA
        b = response[pos++] & 0xff;
        long offset = b & 0x7f;
        while ((b & 0x80) != 0) {
          b = response[pos++] & 0xff;
          offset = ((offset + 1) << 7) | (b & 0x7f);
        }
        baseOffset = objectOffset - offset;
      } else if (type == 7) { // REF_DELTA
        baseSha = HexFormat.of().formatHex(response, pos, pos + 20);
        pos += 20;
      }

      Inflater inflater = new Inflater();
      inflater.setInput(response, pos, response.length - pos);
      byte[] data = new byte[(int) size];
      int filled = 0;
      while (!inflater.finished()) {
        int got = inflater.inflate(data, filled, data.length - filled);
        filled += got;
        if (got == 0 && inflater.needsInput()) throw new IOException("packfile truncado");
      }
      pos += (int) inflater.getBytesRead();
      inflater.end();

      byOffset.put(objectOffset, new PackEntry(type, data, baseSha, baseOffset));
      order.add(objectOffset);
    }

    // Resolve objetos inteiros primeiro, depois deltas até não restar pendência.
    Map<Long, GitObject> resolvedByOffset = new HashMap<>();
    Map<String, GitObject> resolvedBySha = new HashMap<>();
    List<Long> pending = new ArrayList<>();
    for (long offset : order) {
      PackEntry entry = byOffset.get(offset);
      if (entry.type() >= 1 && entry.type() <= 4) {
        GitObject object = new GitObject(TYPE_NAMES[entry.type()], entry.data());
        resolvedByOffset.put(offset, object);
        resolvedBySha.put(writeObject(git, object.type(), object.data()), object);
      } else {
        pending.add(offset);
      }
    }
    while (!pending.isEmpty()) {
      List<Long> next = new ArrayList<>();
      for (long offset : pending) {
        PackEntry entry = byOffset.get(offset);
        GitObject base = entry.type() == 6
            ? resolvedByOffset.get(entry.baseOffset())
            : resolvedBySha.get(entry.baseSha());
        if (base == null) {
          next.add(offset);
          continue;
        }
        GitObject object = new GitObject(base.type(), applyDelta(base.data(), entry.data()));
        resolvedByOffset.put(offset, object);
        resolvedBySha.put(writeObject(git, object.type(), object.data()), object);
      }
      if (next.size() == pending.size()) throw new IOException("delta sem objeto base no packfile");
      pending = next;
    }
  }

  static int readInt32(byte[] bytes, int pos) {
    return ((bytes[pos] & 0xff) << 24) | ((bytes[pos + 1] & 0xff) << 16)
        | ((bytes[pos + 2] & 0xff) << 8) | (bytes[pos + 3] & 0xff);
  }

  static byte[] applyDelta(byte[] base, byte[] delta) {
    int[] pos = {0};
    readDeltaSize(delta, pos); // tamanho da base
    long targetSize = readDeltaSize(delta, pos);
    ByteArrayOutputStream out = new ByteArrayOutputStream((int) targetSize);
    while (pos[0] < delta.length) {
      int op = delta[pos[0]++] & 0xff;
      if ((op & 0x80) != 0) { // copy
        long offset = 0;
        long size = 0;
        for (int i = 0; i < 4; i++) {
          if ((op & (1 << i)) != 0) offset |= (long) (delta[pos[0]++] & 0xff) << (8 * i);
        }
        for (int i = 0; i < 3; i++) {
          if ((op & (0x10 << i)) != 0) size |= (long) (delta[pos[0]++] & 0xff) << (8 * i);
        }
        if (size == 0) size = 0x10000;
        out.write(base, (int) offset, (int) size);
      } else if (op != 0) { // insert
        out.write(delta, pos[0], op);
        pos[0] += op;
      } else {
        throw new IllegalStateException("instrução de delta inválida");
      }
    }
    return out.toByteArray();
  }

  static long readDeltaSize(byte[] delta, int[] pos) {
    long size = 0;
    int shift = 0;
    int b;
    do {
      b = delta[pos[0]++] & 0xff;
      size |= (long) (b & 0x7f) << shift;
      shift += 7;
    } while ((b & 0x80) != 0);
    return size;
  }

  static void checkout(Path git, String treeSha, Path dir) throws Exception {
    Files.createDirectories(dir);
    for (TreeEntry entry : parseTree(readObject(git, treeSha).data())) {
      Path path = dir.resolve(entry.name());
      if (entry.mode().equals("40000")) {
        checkout(git, entry.sha(), path);
      } else if (entry.mode().equals("160000")) {
        Files.createDirectories(path); // submódulo: só o diretório vazio
      } else {
        Files.write(path, readObject(git, entry.sha()).data());
        if (entry.mode().equals("100755")) path.toFile().setExecutable(true);
      }
    }
  }
}
