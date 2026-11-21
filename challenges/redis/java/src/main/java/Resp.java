import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Protocolo RESP (versão 2).
 *
 * Strings são tratadas como ISO-8859-1: cada byte vira exatamente um char, então valores
 * binários (bitmaps, RDB) atravessam o servidor sem perdas.
 */
final class Resp {
  static final java.nio.charset.Charset BYTES = StandardCharsets.ISO_8859_1;

  private Resp() {}

  /** Lê bytes contando quantos foram consumidos (a réplica precisa do offset). */
  static final class Reader {
    private final InputStream in;
    private long consumed;

    Reader(InputStream in) {
      this.in = in;
    }

    long consumed() {
      return consumed;
    }

    int read() throws IOException {
      int b = in.read();
      if (b >= 0) consumed++;
      return b;
    }

    String readLine() throws IOException {
      ByteArrayOutputStream line = new ByteArrayOutputStream();
      while (true) {
        int b = read();
        if (b < 0) {
          if (line.size() == 0) return null;
          throw new EOFException();
        }
        if (b == '\r') {
          int next = read();
          if (next == '\n') break;
          line.write(b);
          if (next >= 0) line.write(next);
          continue;
        }
        if (b == '\n') break;
        line.write(b);
      }
      return line.toString(BYTES);
    }

    byte[] readExactly(int length) throws IOException {
      byte[] data = in.readNBytes(length);
      if (data.length < length) throw new EOFException();
      consumed += length;
      return data;
    }

    /** Um comando: array RESP de bulk strings, ou uma linha "inline" (PING\r\n). null no EOF. */
    List<String> readCommand() throws IOException {
      String line;
      do {
        line = readLine();
        if (line == null) return null;
      } while (line.isEmpty());
      if (line.charAt(0) != '*') return new ArrayList<>(List.of(line.trim().split("\\s+")));
      int count = Integer.parseInt(line.substring(1));
      List<String> parts = new ArrayList<>(count);
      for (int i = 0; i < count; i++) parts.add(readBulk());
      return parts;
    }

    String readBulk() throws IOException {
      String header = readLine();
      if (header == null) throw new EOFException();
      if (header.charAt(0) != '$') throw new IOException("esperava bulk string, veio " + header);
      int length = Integer.parseInt(header.substring(1));
      String value = new String(readExactly(length), BYTES);
      readLine(); // CRLF
      return value;
    }
  }

  // ------------------------------------------------------------------ respostas

  static byte[] simple(String text) {
    return ("+" + text + "\r\n").getBytes(BYTES);
  }

  static byte[] error(String text) {
    return ("-" + text + "\r\n").getBytes(BYTES);
  }

  static byte[] integer(long value) {
    return (":" + value + "\r\n").getBytes(BYTES);
  }

  static byte[] bulk(String value) {
    if (value == null) return nullBulk();
    return ("$" + value.length() + "\r\n" + value + "\r\n").getBytes(BYTES);
  }

  static byte[] nullBulk() {
    return "$-1\r\n".getBytes(BYTES);
  }

  static byte[] nullArray() {
    return "*-1\r\n".getBytes(BYTES);
  }

  static byte[] array(List<byte[]> items) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.writeBytes(("*" + items.size() + "\r\n").getBytes(BYTES));
    for (byte[] item : items) out.writeBytes(item);
    return out.toByteArray();
  }

  static byte[] array(byte[]... items) {
    return array(List.of(items));
  }

  static byte[] bulkArray(List<String> values) {
    List<byte[]> items = new ArrayList<>();
    for (String value : values) items.add(bulk(value));
    return array(items);
  }

  /** Um comando no formato em que é propagado para réplicas e gravado no AOF. */
  static byte[] command(List<String> parts) {
    return bulkArray(parts);
  }

  static String text(byte[] reply) {
    return new String(reply, BYTES);
  }
}
