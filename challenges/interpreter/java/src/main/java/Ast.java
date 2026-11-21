import java.util.List;

/**
 * Árvore sintática. Os nós são records; o Resolver usa um IdentityHashMap porque dois nós
 * com o mesmo conteúdo (ex.: `a + a`) continuam sendo nós diferentes.
 */
final class Ast {
  private Ast() {}

  sealed interface Expr {}

  record Assign(Token name, Expr value) implements Expr {}

  record Binary(Expr left, Token operator, Expr right) implements Expr {}

  record Call(Expr callee, Token paren, List<Expr> arguments) implements Expr {}

  record Get(Expr object, Token name) implements Expr {}

  record Grouping(Expr expression) implements Expr {}

  record Literal(Object value) implements Expr {}

  record Logical(Expr left, Token operator, Expr right) implements Expr {}

  record SetField(Expr object, Token name, Expr value) implements Expr {}

  record Super(Token keyword, Token method) implements Expr {}

  record This(Token keyword) implements Expr {}

  record Unary(Token operator, Expr right) implements Expr {}

  record Variable(Token name) implements Expr {}

  sealed interface Stmt {}

  record Block(List<Stmt> statements) implements Stmt {}

  record ClassDecl(Token name, Variable superclass, List<Function> methods) implements Stmt {}

  record Expression(Expr expression) implements Stmt {}

  record Function(Token name, List<Token> params, List<Stmt> body) implements Stmt {}

  record If(Expr condition, Stmt thenBranch, Stmt elseBranch) implements Stmt {}

  record Print(Expr expression) implements Stmt {}

  record Return(Token keyword, Expr value) implements Stmt {}

  record Var(Token name, Expr initializer) implements Stmt {}

  record While(Expr condition, Stmt body) implements Stmt {}

  /** Imprime uma expressão em notação prefixada: (+ 1.0 (group 2.0)). */
  static String print(Expr expr) {
    return switch (expr) {
      case Binary b -> parens(b.operator().lexeme(), b.left(), b.right());
      case Logical l -> parens(l.operator().lexeme(), l.left(), l.right());
      case Grouping g -> parens("group", g.expression());
      case Unary u -> parens(u.operator().lexeme(), u.right());
      case Literal lit -> lit.value() == null ? "nil" : lit.value().toString();
      case Variable v -> v.name().lexeme();
      case Assign a -> parens("= " + a.name().lexeme(), a.value());
      case Call c -> "(call " + print(c.callee()) + c.arguments().stream().map(arg -> " " + print(arg)).reduce("", String::concat) + ")";
      case Get g -> parens("." + g.name().lexeme(), g.object());
      case SetField s -> parens("= ." + s.name().lexeme(), s.object(), s.value());
      case Super s -> "(super " + s.method().lexeme() + ")";
      case This t -> "this";
    };
  }

  private static String parens(String name, Expr... exprs) {
    StringBuilder sb = new StringBuilder("(").append(name);
    for (Expr expr : exprs) sb.append(' ').append(print(expr));
    return sb.append(')').toString();
  }
}
