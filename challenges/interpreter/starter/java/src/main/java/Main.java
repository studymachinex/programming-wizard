import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Build your own Interpreter — um interpretador de Lox, a linguagem do livro Crafting
 * Interpreters (Robert Nystrom, craftinginterpreters.com).
 *
 *   ./your_program.sh tokenize programa.lox
 *
 * Mais tarde vêm os comandos parse, evaluate e run. Rode `npm run cc -- task` para ver o stage atual.
 */
public class Main {
  public static void main(String[] args) throws IOException {
    if (args.length < 2) {
      System.err.println("uso: ./your_program.sh tokenize <arquivo>");
      System.exit(64);
    }
    String command = args[0];
    String source = Files.readString(Path.of(args[1]), StandardCharsets.UTF_8);

    if (!command.equals("tokenize")) {
      System.err.println("comando desconhecido: " + command);
      System.exit(64);
    }

    // TODO (stage 1): um arquivo vazio produz só o token de fim de arquivo. Descomente:
    //
    // System.out.println("EOF  null");
    // return;
    System.err.println("scanner ainda não implementado (" + source.length() + " caracteres)");
    System.exit(1);
  }
}
