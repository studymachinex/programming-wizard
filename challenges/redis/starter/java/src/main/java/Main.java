import java.io.IOException;

/**
 * Build your own Redis — um servidor compatível com o protocolo do Redis, em Java.
 *
 *   ./your_program.sh --port 6379
 *
 * O tester sempre passa --port com uma porta livre. Rode `npm run cc -- task` para ver o stage atual.
 */
public class Main {
  public static void main(String[] args) throws IOException {
    int port = 6379;
    for (int i = 0; i + 1 < args.length; i++) {
      if (args[i].equals("--port")) port = Integer.parseInt(args[i + 1]);
    }

    // TODO (stage 1): abra um ServerSocket na porta e aceite uma conexão. Descomente:
    //
    // try (java.net.ServerSocket serverSocket = new java.net.ServerSocket()) {
    //   serverSocket.setReuseAddress(true);
    //   serverSocket.bind(new java.net.InetSocketAddress(port));
    //   java.net.Socket client = serverSocket.accept();
    //   client.close();
    // }
    System.err.println("servidor ainda não implementado (porta " + port + ")");
  }
}
