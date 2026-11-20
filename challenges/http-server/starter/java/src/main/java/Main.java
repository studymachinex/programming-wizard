import java.io.IOException;

/**
 * Build Your Own HTTP Server — starter.
 *
 * <p>O tester do stage 1 vai executar este programa e tentar abrir uma conexão TCP na porta 4221.
 * Hoje o programa apenas termina, então o primeiro stage falha de propósito.
 *
 * <p>Comece criando um {@link java.net.ServerSocket} na porta 4221 e mantenha o processo vivo
 * aceitando conexões. A cada stage você evolui este mesmo arquivo.
 */
public class Main {
  private static final int PORT = 4221;

  public static void main(String[] args) throws IOException {
    // TODO(stage 1): abra um ServerSocket na porta 4221 e aceite conexões.
    // Dica:
    //   try (ServerSocket serverSocket = new ServerSocket(PORT)) {
    //     while (true) {
    //       Socket client = serverSocket.accept();
    //       // trate a conexão
    //     }
    //   }
    System.out.println("HTTP server ainda não implementado. Abra src/main/java/Main.java e comece pelo stage 1.");
  }
}
