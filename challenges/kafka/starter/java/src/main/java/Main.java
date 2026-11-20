import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Build your own Kafka — um broker que fala o protocolo binário do Kafka.
 *
 *   ./your_program.sh <server.properties>
 *
 * O server.properties traz "listeners" (a porta, ex.: PLAINTEXT://:9092) e "log.dirs"
 * (onde ficam os logs de metadados e das partições). Rode `npm run cc -- task`.
 */
public class Main {
  public static void main(String[] args) throws IOException {
    Properties props = new Properties();
    if (args.length > 0) {
      try (var reader = Files.newBufferedReader(Path.of(args[0]))) {
        props.load(reader);
      }
    }
    String listeners = props.getProperty("listeners", "PLAINTEXT://:9092");
    int port = Integer.parseInt(listeners.substring(listeners.lastIndexOf(':') + 1).trim());

    // TODO (stage 1): aceite conexões TCP na porta do "listeners". Descomente:
    //
    // try (ServerSocket server = new ServerSocket(port, 50, InetAddress.getByName("127.0.0.1"))) {
    //   server.setReuseAddress(true);
    //   while (true) {
    //     Socket client = server.accept();
    //     System.err.println("cliente conectado: " + client.getRemoteSocketAddress());
    //   }
    // }
    System.err.println("broker ainda não implementado (porta " + port + ")");
    System.exit(1);
  }
}
