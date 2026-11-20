import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

/**
 * Build your own BitTorrent — um cliente BitTorrent do zero.
 *
 *   ./your_program.sh decode 5:hello
 *   ./your_program.sh info exemplo.torrent
 *   ./your_program.sh download -o arquivo.bin exemplo.torrent
 *
 * Rode `npm run cc -- task` para ver o stage atual.
 */
public class Main {
  static final PrintStream OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);

  public static void main(String[] args) throws Exception {
    if (args.length == 0) {
      System.err.println("uso: your_program.sh <comando> [<args>...]");
      System.exit(1);
    }

    switch (args[0]) {
      case "decode" -> {
        String encoded = args[1];
        // TODO (stage 1): decodifique uma string bencodada ("5:hello" → "hello") e imprima
        // o resultado como JSON (com aspas). Descomente:
        //
        // int colon = encoded.indexOf(':');
        // int length = Integer.parseInt(encoded.substring(0, colon));
        // String value = encoded.substring(colon + 1, colon + 1 + length);
        // OUT.println("\"" + value + "\"");
        System.err.println("decode ainda não implementado: " + encoded);
        System.exit(1);
      }
      // Próximos stages: "info", "peers", "handshake", "download_piece", "download"
      // e os comandos "magnet_*".
      default -> {
        System.err.println("Unknown command: " + args[0]);
        System.exit(1);
      }
    }
    OUT.flush();
  }
}
