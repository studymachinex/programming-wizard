import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Build your own Interpreter — implementação de referência de Lox, a linguagem do livro
 * Crafting Interpreters (Robert Nystrom, craftinginterpreters.com).
 *
 *   ./your_program.sh tokenize programa.lox   → tokens
 *   ./your_program.sh parse    programa.lox   → árvore de uma expressão
 *   ./your_program.sh evaluate programa.lox   → valor de uma expressão
 *   ./your_program.sh run      programa.lox   → executa o programa
 *
 * Códigos de saída: 65 para erros léxicos, de sintaxe ou de resolução; 70 para erros de execução.
 */
public class Main {
  public static void main(String[] args) throws IOException {
    if (args.length < 2) {
      System.err.println("uso: ./your_program.sh <tokenize|parse|evaluate|run> <arquivo>");
      System.exit(64);
    }
    String source = Files.readString(Path.of(args[1]), StandardCharsets.UTF_8);
    List<Token> tokens = new Scanner(source).scanTokens();

    switch (args[0]) {
      case "tokenize" -> {
        for (Token token : tokens) System.out.println(token);
        exitOnError();
      }
      case "parse" -> {
        exitOnError();
        Ast.Expr expr = new Parser(tokens).parseExpression();
        exitOnError();
        System.out.println(Ast.print(expr));
      }
      case "evaluate" -> {
        exitOnError();
        Ast.Expr expr = new Parser(tokens).parseExpression();
        exitOnError();
        new Interpreter().evaluateAndPrint(expr);
        exitOnError();
      }
      case "run" -> {
        exitOnError();
        List<Ast.Stmt> statements = new Parser(tokens).parse();
        exitOnError();
        Interpreter interpreter = new Interpreter();
        new Resolver(interpreter).resolve(statements);
        exitOnError();
        interpreter.interpret(statements);
        exitOnError();
      }
      default -> {
        System.err.println("comando desconhecido: " + args[0]);
        System.exit(64);
      }
    }
  }

  private static void exitOnError() {
    System.out.flush();
    if (Lox.hadError) System.exit(65);
    if (Lox.hadRuntimeError) System.exit(70);
  }
}
