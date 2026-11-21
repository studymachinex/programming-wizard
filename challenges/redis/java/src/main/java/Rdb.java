import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/** Leitura de arquivos RDB (só valores do tipo string) e o RDB vazio enviado às réplicas. */
final class Rdb {
  record Entry(String key, String value, long expiresAtMs) {}

  private Rdb() {}

  /** Um RDB válido sem nenhuma chave: cabeçalho, fim (0xFF) e checksum zerado. */
  static byte[] empty() {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.writeBytes("REDIS0011".getBytes(Resp.BYTES));
    out.write(0xFF);
    out.writeBytes(new byte[8]);
    return out.toByteArray();
  }

  static List<Entry> read(InputStream input) throws IOException {
    DataInputStream in = new DataInputStream(input);
    byte[] magic = in.readNBytes(9);
    if (!new String(magic, Resp.BYTES).startsWith("REDIS")) throw new IOException("não é um arquivo RDB");
    List<Entry> entries = new ArrayList<>();
    long expiresAt = -1;
    while (true) {
      int opcode = in.read();
      if (opcode < 0 || opcode == 0xFF) break;
      switch (opcode) {
        case 0xFA -> { // metadado: nome e valor
          readString(in);
          readString(in);
        }
        case 0xFE -> readLength(in); // seleção de banco
        case 0xFB -> { // tamanhos das tabelas
          readLength(in);
          readLength(in);
        }
        case 0xFC -> expiresAt = Long.reverseBytes(in.readLong());
        case 0xFD -> expiresAt = (Integer.reverseBytes(in.readInt()) & 0xFFFFFFFFL) * 1000;
        case 0x00 -> { // valor string
          String key = readString(in);
          String value = readString(in);
          entries.add(new Entry(key, value, expiresAt));
          expiresAt = -1;
        }
        default -> throw new IOException("tipo de valor RDB não suportado: " + opcode);
      }
    }
    return entries;
  }

  /** Comprimento: os dois bits altos dizem o formato (6 bits, 14 bits, 32 ou 64 bits). */
  private static long readLength(DataInputStream in) throws IOException {
    int first = in.readUnsignedByte();
    return switch (first >> 6) {
      case 0 -> first & 0x3F;
      case 1 -> ((first & 0x3F) << 8) | in.readUnsignedByte();
      case 2 -> first == 0x80 ? in.readInt() & 0xFFFFFFFFL : in.readLong();
      default -> -(first & 0x3F) - 1; // codificação especial (inteiro): devolvido como negativo
    };
  }

  private static String readString(DataInputStream in) throws IOException {
    long length = readLength(in);
    if (length >= 0) return new String(in.readNBytes((int) length), Resp.BYTES);
    int encoding = (int) (-length - 1);
    return switch (encoding) {
      case 0 -> String.valueOf(in.readByte());
      case 1 -> String.valueOf(Short.reverseBytes(in.readShort()));
      case 2 -> String.valueOf(Integer.reverseBytes(in.readInt()));
      default -> throw new IOException("strings comprimidas (LZF) não são suportadas");
    };
  }
}
