/** Um token: tipo, texto original, valor literal (para números e strings) e linha. */
record Token(TokenType type, String lexeme, Object literal, int line) {
  /** Formato do comando tokenize: TIPO lexema literal. */
  @Override
  public String toString() {
    String value = literal == null ? "null" : literal.toString();
    return type + " " + lexeme + " " + value;
  }
}
