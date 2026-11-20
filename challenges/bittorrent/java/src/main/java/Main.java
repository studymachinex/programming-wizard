import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Implementação de referência do desafio "Build your own BitTorrent" (19 stages).
 *
 * Comandos: decode, info, peers, handshake, download_piece, download,
 * magnet_parse, magnet_handshake, magnet_info, magnet_download_piece, magnet_download.
 */
public class Main {
  static final PrintStream OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);
  static final int BLOCK = 16 * 1024;
  static final int OUR_METADATA_ID = 16;
  static final byte[] PEER_ID = randomPeerId();

  public static void main(String[] args) throws Exception {
    if (args.length == 0) {
      System.err.println("uso: your_program.sh <comando> [<args>...]");
      System.exit(1);
    }
    switch (args[0]) {
      case "decode" -> OUT.println(toJson(new Bencode(args[1].getBytes(StandardCharsets.UTF_8)).decode()));
      case "info" -> printInfo(Torrent.load(Path.of(args[1])));
      case "peers" -> {
        Torrent t = Torrent.load(Path.of(args[1]));
        for (InetSocketAddress peer : announce(t.announce, t.infoHash, t.length)) OUT.println(address(peer));
      }
      case "handshake" -> {
        Torrent t = Torrent.load(Path.of(args[1]));
        try (Peer peer = Peer.connect(parseAddress(args[2]), t.infoHash, false)) {
          OUT.println("Peer ID: " + hex(peer.remotePeerId));
        }
      }
      case "download_piece" -> { // download_piece -o <saída> <torrent> <índice>
        Torrent t = Torrent.load(Path.of(args[3]));
        int index = Integer.parseInt(args[4]);
        try (Peer peer = Peer.connect(announce(t.announce, t.infoHash, t.length).get(0), t.infoHash, false)) {
          peer.prepare();
          Files.write(Path.of(args[2]), peer.downloadPiece(t, index));
        }
      }
      case "download" -> {
        Torrent t = Torrent.load(Path.of(args[3]));
        try (Peer peer = Peer.connect(announce(t.announce, t.infoHash, t.length).get(0), t.infoHash, false)) {
          peer.prepare();
          Files.write(Path.of(args[2]), peer.downloadAll(t));
        }
      }
      case "magnet_parse" -> {
        Magnet m = Magnet.parse(args[1]);
        OUT.println("Tracker URL: " + m.tracker);
        OUT.println("Info Hash: " + hex(m.infoHash));
      }
      case "magnet_handshake" -> {
        Magnet m = Magnet.parse(args[1]);
        try (Peer peer = Peer.connect(announce(m.tracker, m.infoHash, 999).get(0), m.infoHash, true)) {
          OUT.println("Peer ID: " + hex(peer.remotePeerId));
          peer.extensionHandshake();
          OUT.println("Peer Metadata Extension ID: " + peer.remoteMetadataId);
        }
      }
      case "magnet_info" -> {
        Magnet m = Magnet.parse(args[1]);
        try (Peer peer = Peer.connect(announce(m.tracker, m.infoHash, 999).get(0), m.infoHash, true)) {
          peer.extensionHandshake();
          printInfo(peer.fetchMetadata(m));
        }
      }
      case "magnet_download_piece", "magnet_download" -> {
        boolean whole = args[0].equals("magnet_download");
        Path output = Path.of(args[2]);
        Magnet m = Magnet.parse(args[3]);
        try (Peer peer = Peer.connect(announce(m.tracker, m.infoHash, 999).get(0), m.infoHash, true)) {
          peer.extensionHandshake();
          Torrent t = peer.fetchMetadata(m);
          peer.prepare();
          Files.write(output, whole ? peer.downloadAll(t) : peer.downloadPiece(t, Integer.parseInt(args[4])));
        }
      }
      default -> {
        System.err.println("Unknown command: " + args[0]);
        System.exit(1);
      }
    }
    OUT.flush();
  }

  static byte[] randomPeerId() {
    byte[] id = new byte[20];
    new SecureRandom().nextBytes(id);
    return id;
  }

  static void printInfo(Torrent t) {
    OUT.println("Tracker URL: " + t.announce);
    OUT.println("Length: " + t.length);
    OUT.println("Info Hash: " + hex(t.infoHash));
    OUT.println("Piece Length: " + t.pieceLength);
    OUT.println("Piece Hashes:");
    for (int i = 0; i < t.pieceCount(); i++) OUT.println(hex(t.pieceHash(i)));
  }

  static String hex(byte[] bytes) {
    return HexFormat.of().formatHex(bytes);
  }

  static byte[] sha1(byte[] data) throws Exception {
    return MessageDigest.getInstance("SHA-1").digest(data);
  }

  static String address(InetSocketAddress a) {
    return a.getHostString() + ":" + a.getPort();
  }

  static InetSocketAddress parseAddress(String text) {
    int colon = text.lastIndexOf(':');
    return new InetSocketAddress(text.substring(0, colon), Integer.parseInt(text.substring(colon + 1)));
  }

  // -------------------------------------------------------------- bencode

  static final class Bencode {
    final byte[] data;
    int pos;
    int infoStart = -1;
    int infoEnd = -1;

    Bencode(byte[] data) {
      this.data = data;
    }

    Object decode() {
      byte c = data[pos];
      if (c == 'i') {
        int end = indexOf('e', pos);
        long value = Long.parseLong(new String(data, pos + 1, end - pos - 1, StandardCharsets.US_ASCII));
        pos = end + 1;
        return value;
      }
      if (c == 'l') {
        pos++;
        List<Object> list = new ArrayList<>();
        while (data[pos] != 'e') list.add(decode());
        pos++;
        return list;
      }
      if (c == 'd') {
        pos++;
        Map<String, Object> map = new TreeMap<>();
        while (data[pos] != 'e') {
          String key = new String((byte[]) decode(), StandardCharsets.UTF_8);
          int valueStart = pos;
          map.put(key, decode());
          if (key.equals("info") && infoStart < 0) {
            infoStart = valueStart;
            infoEnd = pos;
          }
        }
        pos++;
        return map;
      }
      if (c >= '0' && c <= '9') {
        int colon = indexOf(':', pos);
        int length = Integer.parseInt(new String(data, pos, colon - pos, StandardCharsets.US_ASCII));
        byte[] value = Arrays.copyOfRange(data, colon + 1, colon + 1 + length);
        pos = colon + 1 + length;
        return value;
      }
      throw new IllegalArgumentException("bencode inválido na posição " + pos);
    }

    int indexOf(char c, int from) {
      for (int i = from; i < data.length; i++) if (data[i] == c) return i;
      throw new IllegalArgumentException("bencode truncado");
    }
  }

  static byte[] encode(Object value) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    encode(out, value);
    return out.toByteArray();
  }

  @SuppressWarnings("unchecked")
  static void encode(ByteArrayOutputStream out, Object value) {
    if (value instanceof Long || value instanceof Integer) {
      out.writeBytes(("i" + value + "e").getBytes(StandardCharsets.US_ASCII));
    } else if (value instanceof String s) {
      encode(out, s.getBytes(StandardCharsets.UTF_8));
    } else if (value instanceof byte[] b) {
      out.writeBytes((b.length + ":").getBytes(StandardCharsets.US_ASCII));
      out.writeBytes(b);
    } else if (value instanceof List<?> list) {
      out.write('l');
      for (Object item : list) encode(out, item);
      out.write('e');
    } else if (value instanceof Map<?, ?> map) {
      out.write('d');
      for (Map.Entry<String, Object> e : new TreeMap<>((Map<String, Object>) map).entrySet()) {
        encode(out, e.getKey());
        encode(out, e.getValue());
      }
      out.write('e');
    } else {
      throw new IllegalArgumentException("tipo não suportado: " + value);
    }
  }

  @SuppressWarnings("unchecked")
  static String toJson(Object value) {
    if (value instanceof Long) return value.toString();
    if (value instanceof byte[] b) return jsonString(new String(b, StandardCharsets.UTF_8));
    if (value instanceof List<?> list) {
      List<String> items = new ArrayList<>();
      for (Object item : list) items.add(toJson(item));
      return "[" + String.join(",", items) + "]";
    }
    Map<String, Object> map = (Map<String, Object>) value;
    List<String> items = new ArrayList<>();
    for (Map.Entry<String, Object> e : map.entrySet()) items.add(jsonString(e.getKey()) + ":" + toJson(e.getValue()));
    return "{" + String.join(",", items) + "}";
  }

  static String jsonString(String s) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : s.toCharArray()) {
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        default -> {
          if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
          else out.append(c);
        }
      }
    }
    return out.append('"').toString();
  }

  // -------------------------------------------------------------- torrent

  static final class Torrent {
    String announce;
    long length;
    long pieceLength;
    byte[] pieces;
    byte[] infoHash;

    static Torrent load(Path file) throws Exception {
      Bencode parser = new Bencode(Files.readAllBytes(file));
      @SuppressWarnings("unchecked")
      Map<String, Object> root = (Map<String, Object>) parser.decode();
      byte[] rawInfo = Arrays.copyOfRange(parser.data, parser.infoStart, parser.infoEnd);
      Torrent t = fromInfo(rawInfo);
      t.announce = new String((byte[]) root.get("announce"), StandardCharsets.UTF_8);
      return t;
    }

    @SuppressWarnings("unchecked")
    static Torrent fromInfo(byte[] rawInfo) throws Exception {
      Map<String, Object> info = (Map<String, Object>) new Bencode(rawInfo).decode();
      Torrent t = new Torrent();
      t.length = (Long) info.get("length");
      t.pieceLength = (Long) info.get("piece length");
      t.pieces = (byte[]) info.get("pieces");
      t.infoHash = sha1(rawInfo);
      return t;
    }

    int pieceCount() {
      return pieces.length / 20;
    }

    byte[] pieceHash(int index) {
      return Arrays.copyOfRange(pieces, index * 20, index * 20 + 20);
    }

    int pieceSize(int index) {
      long start = index * pieceLength;
      return (int) Math.min(pieceLength, length - start);
    }
  }

  static final class Magnet {
    String tracker;
    byte[] infoHash;

    static Magnet parse(String link) {
      Magnet m = new Magnet();
      for (String part : link.substring(link.indexOf('?') + 1).split("&")) {
        int eq = part.indexOf('=');
        String key = part.substring(0, eq);
        String value = URLDecoder.decode(part.substring(eq + 1), StandardCharsets.UTF_8);
        if (key.equals("xt")) m.infoHash = HexFormat.of().parseHex(value.substring("urn:btih:".length()));
        if (key.equals("tr")) m.tracker = value;
      }
      return m;
    }
  }

  // -------------------------------------------------------------- tracker

  @SuppressWarnings("unchecked")
  static List<InetSocketAddress> announce(String tracker, byte[] infoHash, long left) throws Exception {
    String query = "info_hash=" + percentEncode(infoHash)
        + "&peer_id=" + percentEncode(PEER_ID)
        + "&port=6881&uploaded=0&downloaded=0&left=" + left + "&compact=1";
    String url = tracker + (tracker.contains("?") ? "&" : "?") + query;
    HttpResponse<byte[]> response = HttpClient.newHttpClient().send(
        HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
    Map<String, Object> body = (Map<String, Object>) new Bencode(response.body()).decode();
    if (body.containsKey("failure reason")) {
      throw new IOException("tracker: " + new String((byte[]) body.get("failure reason"), StandardCharsets.UTF_8));
    }
    byte[] peers = (byte[]) body.get("peers");
    List<InetSocketAddress> result = new ArrayList<>();
    for (int i = 0; i + 6 <= peers.length; i += 6) {
      String ip = (peers[i] & 0xff) + "." + (peers[i + 1] & 0xff) + "." + (peers[i + 2] & 0xff) + "." + (peers[i + 3] & 0xff);
      result.add(new InetSocketAddress(ip, ((peers[i + 4] & 0xff) << 8) | (peers[i + 5] & 0xff)));
    }
    return result;
  }

  static String percentEncode(byte[] bytes) {
    StringBuilder out = new StringBuilder();
    for (byte b : bytes) out.append('%').append(String.format("%02X", b & 0xff));
    return out.toString();
  }

  // ----------------------------------------------------------------- peer

  static final class Peer implements AutoCloseable {
    final Socket socket;
    final DataInputStream in;
    final DataOutputStream out;
    byte[] remotePeerId;
    boolean remoteSupportsExtensions;
    int remoteMetadataId = -1;
    long remoteMetadataSize = -1;
    boolean bitfieldSeen;
    boolean unchoked;

    Peer(Socket socket) throws IOException {
      this.socket = socket;
      socket.setSoTimeout(15_000);
      in = new DataInputStream(socket.getInputStream());
      out = new DataOutputStream(socket.getOutputStream());
    }

    static Peer connect(InetSocketAddress address, byte[] infoHash, boolean extensions) throws IOException {
      Socket socket = new Socket();
      socket.connect(address, 10_000);
      Peer peer = new Peer(socket);
      ByteArrayOutputStream hs = new ByteArrayOutputStream();
      hs.write(19);
      hs.writeBytes("BitTorrent protocol".getBytes(StandardCharsets.US_ASCII));
      byte[] reserved = new byte[8];
      if (extensions) reserved[5] = 0x10; // BEP 10: extension protocol
      hs.writeBytes(reserved);
      hs.writeBytes(infoHash);
      hs.writeBytes(PEER_ID);
      peer.out.write(hs.toByteArray());
      peer.out.flush();

      byte[] response = peer.in.readNBytes(68);
      if (response.length < 68 || response[0] != 19) throw new IOException("handshake inválido do peer");
      if (!Arrays.equals(Arrays.copyOfRange(response, 28, 48), infoHash)) throw new IOException("info hash diferente no handshake");
      peer.remoteSupportsExtensions = (response[25] & 0x10) != 0;
      peer.remotePeerId = Arrays.copyOfRange(response, 48, 68);
      return peer;
    }

    record Message(int id, byte[] payload) {}

    Message read() throws IOException {
      while (true) {
        int length = in.readInt();
        if (length == 0) continue; // keep-alive
        int id = in.readUnsignedByte();
        byte[] payload = in.readNBytes(length - 1);
        if (id == 5) bitfieldSeen = true;
        if (id == 1) unchoked = true;
        if (id == 0) unchoked = false;
        return new Message(id, payload);
      }
    }

    void send(int id, byte[] payload) throws IOException {
      out.writeInt(payload.length + 1);
      out.writeByte(id);
      out.write(payload);
      out.flush();
    }

    void waitFor(int id) throws IOException {
      while (true) {
        Message m = read();
        if (m.id() == id) return;
        if (m.id() == 20) handleExtension(m);
      }
    }

    @SuppressWarnings("unchecked")
    void handleExtension(Message m) {
      if ((m.payload()[0] & 0xff) != 0) return;
      Map<String, Object> dict = (Map<String, Object>) new Bencode(Arrays.copyOfRange(m.payload(), 1, m.payload().length)).decode();
      Map<String, Object> ids = (Map<String, Object>) dict.get("m");
      if (ids != null && ids.get("ut_metadata") instanceof Long id) remoteMetadataId = id.intValue();
      if (dict.get("metadata_size") instanceof Long size) remoteMetadataSize = size;
    }

    /** BEP 10: envia o nosso handshake de extensão e espera o do peer. */
    void extensionHandshake() throws IOException {
      if (!remoteSupportsExtensions) throw new IOException("o peer não anunciou suporte a extensões");
      if (!bitfieldSeen) waitFor(5);
      byte[] dict = encode(Map.of("m", Map.of("ut_metadata", (long) OUR_METADATA_ID)));
      byte[] payload = new byte[dict.length + 1];
      System.arraycopy(dict, 0, payload, 1, dict.length);
      send(20, payload);
      while (remoteMetadataId < 0) {
        Message m = read();
        if (m.id() == 20) handleExtension(m);
      }
    }

    /** BEP 9: pede o dicionário info (peça 0 dos metadados) e confere o hash. */
    @SuppressWarnings("unchecked")
    Torrent fetchMetadata(Magnet magnet) throws Exception {
      byte[] dict = encode(Map.of("msg_type", 0L, "piece", 0L));
      byte[] payload = new byte[dict.length + 1];
      payload[0] = (byte) remoteMetadataId;
      System.arraycopy(dict, 0, payload, 1, dict.length);
      send(20, payload);
      while (true) {
        Message m = read();
        if (m.id() != 20 || (m.payload()[0] & 0xff) != OUR_METADATA_ID) continue;
        Bencode parser = new Bencode(Arrays.copyOfRange(m.payload(), 1, m.payload().length));
        Map<String, Object> header = (Map<String, Object>) parser.decode();
        if ((Long) header.get("msg_type") != 1L) throw new IOException("o peer recusou os metadados");
        byte[] metadata = Arrays.copyOfRange(parser.data, parser.pos, parser.data.length);
        if (!Arrays.equals(sha1(metadata), magnet.infoHash)) throw new IOException("metadados com hash diferente do magnet");
        Torrent t = Torrent.fromInfo(metadata);
        t.announce = magnet.tracker;
        return t;
      }
    }

    /** bitfield → interested → unchoke. */
    void prepare() throws IOException {
      if (!bitfieldSeen) waitFor(5);
      send(2, new byte[0]);
      if (!unchoked) waitFor(1);
    }

    byte[] downloadPiece(Torrent t, int index) throws Exception {
      int size = t.pieceSize(index);
      byte[] piece = new byte[size];
      int requested = 0;
      int received = 0;
      int inFlight = 0;
      while (received < size) {
        while (inFlight < 5 && requested < size) {
          int length = Math.min(BLOCK, size - requested);
          byte[] payload = java.nio.ByteBuffer.allocate(12).putInt(index).putInt(requested).putInt(length).array();
          send(6, payload);
          requested += length;
          inFlight++;
        }
        Message m = read();
        if (m.id() != 7) continue;
        java.nio.ByteBuffer buffer = java.nio.ByteBuffer.wrap(m.payload());
        int pieceIndex = buffer.getInt();
        int begin = buffer.getInt();
        if (pieceIndex != index) continue;
        System.arraycopy(m.payload(), 8, piece, begin, m.payload().length - 8);
        received += m.payload().length - 8;
        inFlight--;
      }
      if (!Arrays.equals(sha1(piece), t.pieceHash(index))) throw new IOException("hash da peça " + index + " não confere");
      return piece;
    }

    byte[] downloadAll(Torrent t) throws Exception {
      ByteArrayOutputStream file = new ByteArrayOutputStream();
      for (int i = 0; i < t.pieceCount(); i++) file.writeBytes(downloadPiece(t, i));
      return file.toByteArray();
    }

    @Override
    public void close() throws IOException {
      socket.close();
    }
  }
}
