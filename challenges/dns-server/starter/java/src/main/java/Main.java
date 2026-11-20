import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;

/**
 * Build your own DNS server — servidor UDP na porta 2053.
 *
 * O tester inicia o programa com `--resolver <ip:porta>` (usado só no stage 8) e envia
 * pacotes DNS crus. Rode `npm run cc -- task` para ver o stage atual.
 */
public class Main {
  public static void main(String[] args) throws IOException {
    int port = 2053;
    for (int i = 0; i < args.length; i++) {
      if (args[i].equals("--port") && i + 1 < args.length) port = Integer.parseInt(args[++i]);
      // Stage 8: leia também "--resolver <ip:porta>".
    }

    // TODO (stage 1): descomente o loop abaixo. Ele recebe cada pacote UDP e responde
    // com um buffer de 512 bytes — o suficiente para o tester ver uma resposta.
    //
    // try (DatagramSocket server = new DatagramSocket(port, InetAddress.getByName("127.0.0.1"))) {
    //   while (true) {
    //     byte[] buffer = new byte[512];
    //     DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
    //     server.receive(packet);
    //     System.out.println("pacote recebido de " + packet.getSocketAddress());
    //
    //     byte[] response = new byte[512];
    //     server.send(new DatagramPacket(response, response.length, packet.getSocketAddress()));
    //   }
    // }
    System.err.println("servidor DNS ainda não implementado (porta " + port + ")");
    System.exit(1);
  }
}
