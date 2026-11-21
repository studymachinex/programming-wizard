import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.Socket;
import java.util.List;
import java.util.Locale;

/**
 * Lado réplica da replicação: faz o handshake com o master, recebe o RDB e depois aplica,
 * em silêncio, os comandos propagados. Só responde a REPLCONF GETACK, informando quantos bytes
 * de comandos já processou (o offset).
 */
final class Replica implements Runnable {
  private final Server server;
  private final String host;
  private final int port;

  Replica(Server server, String host, int port) {
    this.server = server;
    this.host = host;
    this.port = port;
  }

  @Override
  public void run() {
    try (Socket socket = new Socket(host, port)) {
      socket.setTcpNoDelay(true);
      OutputStream out = socket.getOutputStream();
      Resp.Reader in = new Resp.Reader(new BufferedInputStream(socket.getInputStream()));

      send(out, List.of("PING"));
      expect(in, "+PONG");
      send(out, List.of("REPLCONF", "listening-port", String.valueOf(server.config.port)));
      expect(in, "+OK");
      send(out, List.of("REPLCONF", "capa", "psync2"));
      expect(in, "+OK");
      send(out, List.of("PSYNC", "?", "-1"));
      String fullResync = in.readLine(); // +FULLRESYNC <replid> <offset>
      if (fullResync == null || !fullResync.startsWith("+FULLRESYNC")) throw new IOException("esperava FULLRESYNC, veio " + fullResync);
      String rdbHeader = in.readLine(); // $<tamanho>, seguido dos bytes, sem CRLF no fim
      in.readExactly(Integer.parseInt(rdbHeader.substring(1)));

      Server.Session master = new Server.Session(server, null);
      master.authenticated = true;
      long offset = 0;
      while (true) {
        long before = in.consumed();
        List<String> command = in.readCommand();
        if (command == null) break;
        long size = in.consumed() - before;
        String name = command.get(0).toUpperCase(Locale.ROOT);
        if (name.equals("REPLCONF") && command.size() > 1 && command.get(1).equalsIgnoreCase("GETACK")) {
          send(out, List.of("REPLCONF", "ACK", String.valueOf(offset)));
        } else {
          synchronized (server.lock) {
            server.execute(master, command, true);
          }
        }
        offset += size;
      }
    } catch (IOException e) {
      System.err.println("replicação encerrada: " + e.getMessage());
    }
  }

  private static void send(OutputStream out, List<String> command) throws IOException {
    out.write(Resp.command(command));
    out.flush();
  }

  private static void expect(Resp.Reader in, String expected) throws IOException {
    String line = in.readLine();
    if (line == null || !line.equalsIgnoreCase(expected)) throw new IOException("esperava " + expected + ", veio " + line);
  }
}
