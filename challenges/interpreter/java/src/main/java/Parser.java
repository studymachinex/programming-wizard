import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Parser descendente recursivo. Gramática (da menor para a maior precedência):
 *
 *   expression → assignment
 *   assignment → ( call "." )? IDENTIFIER "=" assignment | logic_or
 *   logic_or   → logic_and ( "or" logic_and )*
 *   logic_and  → equality ( "and" equality )*
 *   equality   → comparison ( ( "!=" | "==" ) comparison )*
 *   comparison → term ( ( ">" | ">=" | "<" | "<=" ) term )*
 *   term       → factor ( ( "-" | "+" ) factor )*
 *   factor     → unary ( ( "/" | "*" ) unary )*
 *   unary      → ( "!" | "-" ) unary | call
 *   call       → primary ( "(" arguments? ")" | "." IDENTIFIER )*
 *   primary    → literais | IDENTIFIER | "(" expression ")" | "this" | "super" "." IDENTIFIER
 */
final class Parser {
  private static final class ParseError extends RuntimeException {}

  private final List<Token> tokens;
  private int current = 0;

  Parser(List<Token> tokens) {
    this.tokens = tokens;
  }

  /** Para os comandos parse/evaluate: uma única expressão. */
  Ast.Expr parseExpression() {
    try {
      return expression();
    } catch (ParseError error) {
      return null;
    }
  }

  List<Ast.Stmt> parse() {
    List<Ast.Stmt> statements = new ArrayList<>();
    while (!isAtEnd()) {
      Ast.Stmt stmt = declaration();
      if (stmt != null) statements.add(stmt);
    }
    return statements;
  }

  // ---------------------------------------------------------------- declarações

  private Ast.Stmt declaration() {
    try {
      if (match(TokenType.CLASS)) return classDeclaration();
      if (match(TokenType.FUN)) return function("function");
      if (match(TokenType.VAR)) return varDeclaration();
      return statement();
    } catch (ParseError error) {
      synchronize();
      return null;
    }
  }

  private Ast.Stmt classDeclaration() {
    Token name = consume(TokenType.IDENTIFIER, "Expect class name.");
    Ast.Variable superclass = null;
    if (match(TokenType.LESS)) {
      consume(TokenType.IDENTIFIER, "Expect superclass name.");
      superclass = new Ast.Variable(previous());
    }
    consume(TokenType.LEFT_BRACE, "Expect '{' before class body.");
    List<Ast.Function> methods = new ArrayList<>();
    while (!check(TokenType.RIGHT_BRACE) && !isAtEnd()) methods.add(function("method"));
    consume(TokenType.RIGHT_BRACE, "Expect '}' after class body.");
    return new Ast.ClassDecl(name, superclass, methods);
  }

  private Ast.Function function(String kind) {
    Token name = consume(TokenType.IDENTIFIER, "Expect " + kind + " name.");
    consume(TokenType.LEFT_PAREN, "Expect '(' after " + kind + " name.");
    List<Token> params = new ArrayList<>();
    if (!check(TokenType.RIGHT_PAREN)) {
      do {
        if (params.size() >= 255) error(peek(), "Can't have more than 255 parameters.");
        params.add(consume(TokenType.IDENTIFIER, "Expect parameter name."));
      } while (match(TokenType.COMMA));
    }
    consume(TokenType.RIGHT_PAREN, "Expect ')' after parameters.");
    consume(TokenType.LEFT_BRACE, "Expect '{' before " + kind + " body.");
    return new Ast.Function(name, params, block());
  }

  private Ast.Stmt varDeclaration() {
    Token name = consume(TokenType.IDENTIFIER, "Expect variable name.");
    Ast.Expr initializer = match(TokenType.EQUAL) ? expression() : null;
    consume(TokenType.SEMICOLON, "Expect ';' after variable declaration.");
    return new Ast.Var(name, initializer);
  }

  // ------------------------------------------------------------------ comandos

  private Ast.Stmt statement() {
    if (match(TokenType.FOR)) return forStatement();
    if (match(TokenType.IF)) return ifStatement();
    if (match(TokenType.PRINT)) return printStatement();
    if (match(TokenType.RETURN)) return returnStatement();
    if (match(TokenType.WHILE)) return whileStatement();
    if (match(TokenType.LEFT_BRACE)) return new Ast.Block(block());
    return expressionStatement();
  }

  /** for é açúcar sintático: vira um bloco com a inicialização e um while. */
  private Ast.Stmt forStatement() {
    consume(TokenType.LEFT_PAREN, "Expect '(' after 'for'.");
    Ast.Stmt initializer;
    if (match(TokenType.SEMICOLON)) initializer = null;
    else if (match(TokenType.VAR)) initializer = varDeclaration();
    else initializer = expressionStatement();

    Ast.Expr condition = check(TokenType.SEMICOLON) ? null : expression();
    consume(TokenType.SEMICOLON, "Expect ';' after loop condition.");
    Ast.Expr increment = check(TokenType.RIGHT_PAREN) ? null : expression();
    consume(TokenType.RIGHT_PAREN, "Expect ')' after for clauses.");
    Ast.Stmt body = statement();

    if (increment != null) body = new Ast.Block(Arrays.asList(body, new Ast.Expression(increment)));
    body = new Ast.While(condition == null ? new Ast.Literal(true) : condition, body);
    if (initializer != null) body = new Ast.Block(Arrays.asList(initializer, body));
    return body;
  }

  private Ast.Stmt ifStatement() {
    consume(TokenType.LEFT_PAREN, "Expect '(' after 'if'.");
    Ast.Expr condition = expression();
    consume(TokenType.RIGHT_PAREN, "Expect ')' after if condition.");
    Ast.Stmt thenBranch = statement();
    Ast.Stmt elseBranch = match(TokenType.ELSE) ? statement() : null;
    return new Ast.If(condition, thenBranch, elseBranch);
  }

  private Ast.Stmt printStatement() {
    Ast.Expr value = expression();
    consume(TokenType.SEMICOLON, "Expect ';' after value.");
    return new Ast.Print(value);
  }

  private Ast.Stmt returnStatement() {
    Token keyword = previous();
    Ast.Expr value = check(TokenType.SEMICOLON) ? null : expression();
    consume(TokenType.SEMICOLON, "Expect ';' after return value.");
    return new Ast.Return(keyword, value);
  }

  private Ast.Stmt whileStatement() {
    consume(TokenType.LEFT_PAREN, "Expect '(' after 'while'.");
    Ast.Expr condition = expression();
    consume(TokenType.RIGHT_PAREN, "Expect ')' after condition.");
    return new Ast.While(condition, statement());
  }

  private List<Ast.Stmt> block() {
    List<Ast.Stmt> statements = new ArrayList<>();
    while (!check(TokenType.RIGHT_BRACE) && !isAtEnd()) {
      Ast.Stmt stmt = declaration();
      if (stmt != null) statements.add(stmt);
    }
    consume(TokenType.RIGHT_BRACE, "Expect '}' after block.");
    return statements;
  }

  private Ast.Stmt expressionStatement() {
    Ast.Expr expr = expression();
    consume(TokenType.SEMICOLON, "Expect ';' after expression.");
    return new Ast.Expression(expr);
  }

  // --------------------------------------------------------------- expressões

  private Ast.Expr expression() {
    return assignment();
  }

  private Ast.Expr assignment() {
    Ast.Expr expr = or();
    if (match(TokenType.EQUAL)) {
      Token equals = previous();
      Ast.Expr value = assignment();
      if (expr instanceof Ast.Variable variable) return new Ast.Assign(variable.name(), value);
      if (expr instanceof Ast.Get get) return new Ast.SetField(get.object(), get.name(), value);
      error(equals, "Invalid assignment target.");
    }
    return expr;
  }

  private Ast.Expr or() {
    Ast.Expr expr = and();
    while (match(TokenType.OR)) expr = new Ast.Logical(expr, previous(), and());
    return expr;
  }

  private Ast.Expr and() {
    Ast.Expr expr = equality();
    while (match(TokenType.AND)) expr = new Ast.Logical(expr, previous(), equality());
    return expr;
  }

  private Ast.Expr equality() {
    Ast.Expr expr = comparison();
    while (match(TokenType.BANG_EQUAL, TokenType.EQUAL_EQUAL)) expr = new Ast.Binary(expr, previous(), comparison());
    return expr;
  }

  private Ast.Expr comparison() {
    Ast.Expr expr = term();
    while (match(TokenType.GREATER, TokenType.GREATER_EQUAL, TokenType.LESS, TokenType.LESS_EQUAL)) expr = new Ast.Binary(expr, previous(), term());
    return expr;
  }

  private Ast.Expr term() {
    Ast.Expr expr = factor();
    while (match(TokenType.MINUS, TokenType.PLUS)) expr = new Ast.Binary(expr, previous(), factor());
    return expr;
  }

  private Ast.Expr factor() {
    Ast.Expr expr = unary();
    while (match(TokenType.SLASH, TokenType.STAR)) expr = new Ast.Binary(expr, previous(), unary());
    return expr;
  }

  private Ast.Expr unary() {
    if (match(TokenType.BANG, TokenType.MINUS)) return new Ast.Unary(previous(), unary());
    return call();
  }

  private Ast.Expr call() {
    Ast.Expr expr = primary();
    while (true) {
      if (match(TokenType.LEFT_PAREN)) {
        List<Ast.Expr> arguments = new ArrayList<>();
        if (!check(TokenType.RIGHT_PAREN)) {
          do {
            if (arguments.size() >= 255) error(peek(), "Can't have more than 255 arguments.");
            arguments.add(expression());
          } while (match(TokenType.COMMA));
        }
        Token paren = consume(TokenType.RIGHT_PAREN, "Expect ')' after arguments.");
        expr = new Ast.Call(expr, paren, arguments);
      } else if (match(TokenType.DOT)) {
        expr = new Ast.Get(expr, consume(TokenType.IDENTIFIER, "Expect property name after '.'."));
      } else {
        return expr;
      }
    }
  }

  private Ast.Expr primary() {
    if (match(TokenType.FALSE)) return new Ast.Literal(false);
    if (match(TokenType.TRUE)) return new Ast.Literal(true);
    if (match(TokenType.NIL)) return new Ast.Literal(null);
    if (match(TokenType.NUMBER, TokenType.STRING)) return new Ast.Literal(previous().literal());
    if (match(TokenType.THIS)) return new Ast.This(previous());
    if (match(TokenType.IDENTIFIER)) return new Ast.Variable(previous());
    if (match(TokenType.SUPER)) {
      Token keyword = previous();
      consume(TokenType.DOT, "Expect '.' after 'super'.");
      return new Ast.Super(keyword, consume(TokenType.IDENTIFIER, "Expect superclass method name."));
    }
    if (match(TokenType.LEFT_PAREN)) {
      Ast.Expr expr = expression();
      consume(TokenType.RIGHT_PAREN, "Expect ')' after expression.");
      return new Ast.Grouping(expr);
    }
    throw error(peek(), "Expect expression.");
  }

  // ------------------------------------------------------------------ apoio

  private boolean match(TokenType... types) {
    for (TokenType type : types) {
      if (check(type)) {
        advance();
        return true;
      }
    }
    return false;
  }

  private Token consume(TokenType type, String message) {
    if (check(type)) return advance();
    throw error(peek(), message);
  }

  private boolean check(TokenType type) {
    return !isAtEnd() && peek().type() == type;
  }

  private Token advance() {
    if (!isAtEnd()) current++;
    return previous();
  }

  private boolean isAtEnd() {
    return peek().type() == TokenType.EOF;
  }

  private Token peek() {
    return tokens.get(current);
  }

  private Token previous() {
    return tokens.get(current - 1);
  }

  private ParseError error(Token token, String message) {
    Lox.error(token, message);
    return new ParseError();
  }

  /** Descarta tokens até um provável início de comando, para reportar mais de um erro. */
  private void synchronize() {
    advance();
    while (!isAtEnd()) {
      if (previous().type() == TokenType.SEMICOLON) return;
      switch (peek().type()) {
        case CLASS, FUN, VAR, FOR, IF, WHILE, PRINT, RETURN -> {
          return;
        }
        default -> advance();
      }
    }
  }
}
