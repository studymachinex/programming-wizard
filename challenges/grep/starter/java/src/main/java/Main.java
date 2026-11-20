import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Build your own grep — um grep -E com o seu próprio motor de expressões regulares.
 *
 *   echo "apple" | ./your_program.sh -E "a"
 *
 * Código de saída: 0 se alguma linha casou, 1 se nenhuma casou.
 * Regra do desafio: nada de java.util.regex (nem String.matches/replaceAll/split com regex).
 * Rode `npm run cc -- task` para ver o stage atual.
 */
public class Main {
  public static void main(String[] args) throws IOException {
    if (args.length < 2 || !args[0].equals("-E")) {
      System.err.println("uso: your_program.sh -E <padrão>");
      System.exit(2);
    }
    String pattern = args[1];
    String input = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);

    // TODO (stage 1): por enquanto o padrão é um único caractere literal. Descomente:
    //
    // boolean matched = input.indexOf(pattern.charAt(0)) >= 0;
    // System.exit(matched ? 0 : 1);
    System.err.println("grep ainda não implementado (padrão: " + pattern + ", " + input.length() + " chars)");
    System.exit(2);
  }
}
