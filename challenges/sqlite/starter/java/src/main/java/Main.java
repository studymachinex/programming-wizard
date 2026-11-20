import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;

/**
 * Build your own SQLite — leia arquivos .db do SQLite sem biblioteca nenhuma.
 *
 *   ./your_program.sh <banco.db> .dbinfo
 *   ./your_program.sh <banco.db> .tables
 *   ./your_program.sh <banco.db> "SELECT name FROM apples"
 *
 * Rode `npm run cc -- task` para ver o stage atual.
 */
public class Main {
  static final PrintStream OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);

  public static void main(String[] args) throws IOException {
    if (args.length < 2) {
      System.err.println("uso: your_program.sh <banco.db> <comando>");
      System.exit(1);
    }

    final String databasePath = args[0];
    final String command = args[1];

    switch (command) {
      case ".dbinfo" -> {
        try (RandomAccessFile file = new RandomAccessFile(databasePath, "r")) {
          byte[] header = new byte[100];
          file.readFully(header);

          // TODO (stage 1): o tamanho da página fica nos bytes 16 e 17 do header,
          // em big-endian. Descomente:
          //
          // int pageSize = ((header[16] & 0xff) << 8) | (header[17] & 0xff);
          // OUT.println("database page size: " + pageSize);
          System.err.println(".dbinfo ainda não implementado");
          System.exit(1);
        }
      }
      // Próximos stages: ".tables" e consultas SELECT.
      default -> {
        System.err.println("Comando não suportado: " + command);
        System.exit(1);
      }
    }
    OUT.flush();
  }
}
