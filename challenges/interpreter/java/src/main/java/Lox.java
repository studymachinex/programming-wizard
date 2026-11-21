/** Estado global de erros e o formato das mensagens. */
final class Lox {
  static boolean hadError = false;
  static boolean hadRuntimeError = false;

  private Lox() {}

  /** Erro léxico: [line N] Error: mensagem */
  static void error(int line, String message) {
    report(line, "", message);
  }

  /** Erro de sintaxe/resolução: [line N] Error at 'x': mensagem (ou "at end"). */
  static void error(Token token, String message) {
    if (token.type() == TokenType.EOF) report(token.line(), " at end", message);
    else report(token.line(), " at '" + token.lexeme() + "'", message);
  }

  /** Erro de execução: mensagem e, na linha seguinte, [line N]. */
  static void runtimeError(RuntimeError error) {
    System.err.println(error.getMessage() + "\n[line " + error.token.line() + "]");
    hadRuntimeError = true;
  }

  private static void report(int line, String where, String message) {
    System.err.println("[line " + line + "] Error" + where + ": " + message);
    hadError = true;
  }

  static final class RuntimeError extends RuntimeException {
    final Token token;

    RuntimeError(Token token, String message) {
      super(message);
      this.token = token;
    }
  }
}
