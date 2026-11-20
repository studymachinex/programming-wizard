import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Implementação de referência do desafio "Build your own DNS server" (8 stages).
 *
 * Servidor UDP na porta 2053. Sem --resolver, responde todo registro A com 8.8.8.8.
 * Com --resolver <ip:porta>, encaminha cada pergunta (uma por pacote) e junta as respostas.
 */
public class Main {
  static final int DEFAULT_PORT = 2053;

  record Header(int id, boolean qr, int opcode, boolean aa, boolean tc, boolean rd, boolean ra,
                int rcode, int qdcount, int ancount, int nscount, int arcount) {}

  record Question(String name, int type, int klass) {}

  record Answer(String name, int type, int klass, long ttl, byte[] data) {}

  record Message(Header header, List<Question> questions, List<Answer> answers) {}

  public static void main(String[] args) throws IOException {
    int port = DEFAULT_PORT;
    InetSocketAddress resolver = null;
    for (int i = 0; i < args.length; i++) {
      if (args[i].equals("--port") && i + 1 < args.length) {
        port = Integer.parseInt(args[++i]);
      } else if (args[i].equals("--resolver") && i + 1 < args.length) {
        String[] parts = args[++i].split(":");
        resolver = new InetSocketAddress(InetAddress.getByName(parts[0]), Integer.parseInt(parts[1]));
      }
    }

    try (DatagramSocket server = new DatagramSocket(port, InetAddress.getByName("127.0.0.1"))) {
      System.out.println("DNS server ouvindo em 127.0.0.1:" + port
          + (resolver != null ? " · resolver " + resolver : ""));
      while (true) {
        byte[] buffer = new byte[512];
        DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
        server.receive(packet);
        try {
          byte[] request = new byte[packet.getLength()];
          System.arraycopy(buffer, 0, request, 0, request.length);
          byte[] response = handle(request, resolver);
          server.send(new DatagramPacket(response, response.length, packet.getSocketAddress()));
        } catch (Exception error) {
          System.err.println("erro tratando pacote: " + error);
        }
      }
    }
  }

  static byte[] handle(byte[] request, InetSocketAddress resolver) throws IOException {
    Message query = parse(request);
    Header h = query.header();
    List<Answer> answers = new ArrayList<>();
    int rcode = 0;

    if (h.opcode() != 0) {
      rcode = 4; // NOTIMP: só tratamos consultas padrão
    } else if (resolver != null) {
      for (Question question : query.questions()) {
        answers.addAll(forward(resolver, h, question));
      }
    } else {
      for (Question question : query.questions()) {
        answers.add(new Answer(question.name(), 1, 1, 60, new byte[] {8, 8, 8, 8}));
      }
    }

    Header reply = new Header(h.id(), true, h.opcode(), false, false, h.rd(), false, rcode,
        query.questions().size(), answers.size(), 0, 0);
    return serialize(new Message(reply, query.questions(), answers));
  }

  static List<Answer> forward(InetSocketAddress resolver, Header original, Question question) throws IOException {
    Header header = new Header(original.id(), false, 0, false, false, original.rd(), false, 0, 1, 0, 0, 0);
    byte[] out = serialize(new Message(header, List.of(question), List.of()));
    try (DatagramSocket socket = new DatagramSocket()) {
      socket.setSoTimeout(3000);
      socket.send(new DatagramPacket(out, out.length, resolver));
      byte[] buffer = new byte[512];
      DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
      socket.receive(packet);
      byte[] raw = new byte[packet.getLength()];
      System.arraycopy(buffer, 0, raw, 0, raw.length);
      return parse(raw).answers();
    } catch (SocketTimeoutException timeout) {
      System.err.println("resolver não respondeu para " + question.name());
      return List.of();
    }
  }

  // ------------------------------------------------------------- parsing

  static Message parse(byte[] data) {
    int id = u16(data, 0);
    int flags = u16(data, 2);
    Header header = new Header(
        id,
        (flags & 0x8000) != 0,
        (flags >> 11) & 0x0f,
        (flags & 0x0400) != 0,
        (flags & 0x0200) != 0,
        (flags & 0x0100) != 0,
        (flags & 0x0080) != 0,
        flags & 0x0f,
        u16(data, 4), u16(data, 6), u16(data, 8), u16(data, 10));

    int[] pos = {12};
    List<Question> questions = new ArrayList<>();
    for (int i = 0; i < header.qdcount(); i++) {
      String name = readName(data, pos);
      questions.add(new Question(name, u16(data, pos[0]), u16(data, pos[0] + 2)));
      pos[0] += 4;
    }
    List<Answer> answers = new ArrayList<>();
    for (int i = 0; i < header.ancount(); i++) {
      String name = readName(data, pos);
      int type = u16(data, pos[0]);
      int klass = u16(data, pos[0] + 2);
      long ttl = ((long) u16(data, pos[0] + 4) << 16) | u16(data, pos[0] + 6);
      int length = u16(data, pos[0] + 8);
      pos[0] += 10;
      byte[] rdata = new byte[length];
      System.arraycopy(data, pos[0], rdata, 0, length);
      pos[0] += length;
      answers.add(new Answer(name, type, klass, ttl, rdata));
    }
    return new Message(header, questions, answers);
  }

  /** Lê um nome em labels, seguindo ponteiros de compressão (11xxxxxx xxxxxxxx). */
  static String readName(byte[] data, int[] pos) {
    List<String> labels = new ArrayList<>();
    int cursor = pos[0];
    boolean jumped = false;
    int jumps = 0;
    while (true) {
      int length = data[cursor] & 0xff;
      if ((length & 0xc0) == 0xc0) {
        int pointer = ((length & 0x3f) << 8) | (data[cursor + 1] & 0xff);
        if (!jumped) pos[0] = cursor + 2;
        jumped = true;
        if (++jumps > 32) throw new IllegalArgumentException("loop de compressão");
        cursor = pointer;
        continue;
      }
      if (length == 0) {
        if (!jumped) pos[0] = cursor + 1;
        break;
      }
      labels.add(new String(data, cursor + 1, length, StandardCharsets.US_ASCII));
      cursor += 1 + length;
    }
    return String.join(".", labels);
  }

  static int u16(byte[] data, int pos) {
    return ((data[pos] & 0xff) << 8) | (data[pos + 1] & 0xff);
  }

  // --------------------------------------------------------- serialization

  static byte[] serialize(Message message) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    Header h = message.header();
    int flags = (h.qr() ? 0x8000 : 0)
        | (h.opcode() & 0x0f) << 11
        | (h.aa() ? 0x0400 : 0)
        | (h.tc() ? 0x0200 : 0)
        | (h.rd() ? 0x0100 : 0)
        | (h.ra() ? 0x0080 : 0)
        | (h.rcode() & 0x0f);
    writeU16(out, h.id());
    writeU16(out, flags);
    writeU16(out, h.qdcount());
    writeU16(out, h.ancount());
    writeU16(out, h.nscount());
    writeU16(out, h.arcount());
    for (Question question : message.questions()) {
      writeName(out, question.name());
      writeU16(out, question.type());
      writeU16(out, question.klass());
    }
    for (Answer answer : message.answers()) {
      writeName(out, answer.name());
      writeU16(out, answer.type());
      writeU16(out, answer.klass());
      writeU16(out, (int) (answer.ttl() >>> 16));
      writeU16(out, (int) (answer.ttl() & 0xffff));
      writeU16(out, answer.data().length);
      out.writeBytes(answer.data());
    }
    return out.toByteArray();
  }

  static void writeName(ByteArrayOutputStream out, String name) {
    if (!name.isEmpty()) {
      for (String label : name.split("\\.")) {
        byte[] bytes = label.getBytes(StandardCharsets.US_ASCII);
        out.write(bytes.length);
        out.writeBytes(bytes);
      }
    }
    out.write(0);
  }

  static void writeU16(ByteArrayOutputStream out, int value) {
    out.write((value >> 8) & 0xff);
    out.write(value & 0xff);
  }
}
