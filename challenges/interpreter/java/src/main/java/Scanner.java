import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Analisador léxico: transforma o código-fonte numa lista de tokens. */
final class Scanner {
  private static final Map<String, TokenType> KEYWORDS = Map.ofEntries(
      Map.entry("and", TokenType.AND),
      Map.entry("class", TokenType.CLASS),
      Map.entry("else", TokenType.ELSE),
      Map.entry("false", TokenType.FALSE),
      Map.entry("for", TokenType.FOR),
      Map.entry("fun", TokenType.FUN),
      Map.entry("if", TokenType.IF),
      Map.entry("nil", TokenType.NIL),
      Map.entry("or", TokenType.OR),
      Map.entry("print", TokenType.PRINT),
      Map.entry("return", TokenType.RETURN),
      Map.entry("super", TokenType.SUPER),
      Map.entry("this", TokenType.THIS),
      Map.entry("true", TokenType.TRUE),
      Map.entry("var", TokenType.VAR),
      Map.entry("while", TokenType.WHILE));

  private final String source;
  private final List<Token> tokens = new ArrayList<>();
  private int start = 0;
  private int current = 0;
  private int line = 1;

  Scanner(String source) {
    this.source = source;
  }

  List<Token> scanTokens() {
    while (!isAtEnd()) {
      start = current;
      scanToken();
    }
    tokens.add(new Token(TokenType.EOF, "", null, line));
    return tokens;
  }

  private void scanToken() {
    char c = advance();
    switch (c) {
      case '(' -> add(TokenType.LEFT_PAREN);
      case ')' -> add(TokenType.RIGHT_PAREN);
      case '{' -> add(TokenType.LEFT_BRACE);
      case '}' -> add(TokenType.RIGHT_BRACE);
      case ',' -> add(TokenType.COMMA);
      case '.' -> add(TokenType.DOT);
      case '-' -> add(TokenType.MINUS);
      case '+' -> add(TokenType.PLUS);
      case ';' -> add(TokenType.SEMICOLON);
      case '*' -> add(TokenType.STAR);
      case '!' -> add(match('=') ? TokenType.BANG_EQUAL : TokenType.BANG);
      case '=' -> add(match('=') ? TokenType.EQUAL_EQUAL : TokenType.EQUAL);
      case '<' -> add(match('=') ? TokenType.LESS_EQUAL : TokenType.LESS);
      case '>' -> add(match('=') ? TokenType.GREATER_EQUAL : TokenType.GREATER);
      case '/' -> {
        if (match('/')) {
          while (peek() != '\n' && !isAtEnd()) advance();
        } else {
          add(TokenType.SLASH);
        }
      }
      case ' ', '\r', '\t' -> { }
      case '\n' -> line++;
      case '"' -> string();
      default -> {
        if (isDigit(c)) number();
        else if (isAlpha(c)) identifier();
        else Lox.error(line, "Unexpected character: " + c);
      }
    }
  }

  private void string() {
    while (peek() != '"' && !isAtEnd()) {
      if (peek() == '\n') line++;
      advance();
    }
    if (isAtEnd()) {
      Lox.error(line, "Unterminated string.");
      return;
    }
    advance(); // a aspa de fechamento
    add(TokenType.STRING, source.substring(start + 1, current - 1));
  }

  private void number() {
    while (isDigit(peek())) advance();
    if (peek() == '.' && isDigit(peekNext())) {
      advance();
      while (isDigit(peek())) advance();
    }
    add(TokenType.NUMBER, Double.parseDouble(source.substring(start, current)));
  }

  private void identifier() {
    while (isAlphaNumeric(peek())) advance();
    add(KEYWORDS.getOrDefault(source.substring(start, current), TokenType.IDENTIFIER));
  }

  private boolean match(char expected) {
    if (isAtEnd() || source.charAt(current) != expected) return false;
    current++;
    return true;
  }

  private char peek() {
    return isAtEnd() ? '\0' : source.charAt(current);
  }

  private char peekNext() {
    return current + 1 >= source.length() ? '\0' : source.charAt(current + 1);
  }

  private static boolean isDigit(char c) {
    return c >= '0' && c <= '9';
  }

  private static boolean isAlpha(char c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_';
  }

  private static boolean isAlphaNumeric(char c) {
    return isAlpha(c) || isDigit(c);
  }

  private boolean isAtEnd() {
    return current >= source.length();
  }

  private char advance() {
    return source.charAt(current++);
  }

  private void add(TokenType type) {
    add(type, null);
  }

  private void add(TokenType type, Object literal) {
    tokens.add(new Token(type, source.substring(start, current), literal, line));
  }
}
