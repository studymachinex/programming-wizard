import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

/** Interpretador que percorre a árvore (tree-walk). */
final class Interpreter {
  /** Usada para desenrolar a pilha num `return`. */
  static final class ReturnValue extends RuntimeException {
    final Object value;

    ReturnValue(Object value) {
      super(null, null, false, false);
      this.value = value;
    }
  }

  final LoxRuntime.Environment globals = new LoxRuntime.Environment(null);
  private LoxRuntime.Environment environment = globals;
  private final Map<Ast.Expr, Integer> locals = new IdentityHashMap<>();

  Interpreter() {
    globals.define("clock", new LoxRuntime.Callable() {
      @Override
      public int arity() {
        return 0;
      }

      @Override
      public Object call(Interpreter interpreter, List<Object> arguments) {
        return (double) (System.currentTimeMillis() / 1000);
      }

      @Override
      public String toString() {
        return "<native fn>";
      }
    });
  }

  void interpret(List<Ast.Stmt> statements) {
    try {
      for (Ast.Stmt statement : statements) execute(statement);
    } catch (Lox.RuntimeError error) {
      Lox.runtimeError(error);
    }
  }

  /** Para o comando evaluate: avalia uma expressão e imprime o valor. */
  void evaluateAndPrint(Ast.Expr expr) {
    try {
      System.out.println(stringify(evaluate(expr)));
    } catch (Lox.RuntimeError error) {
      Lox.runtimeError(error);
    }
  }

  void resolve(Ast.Expr expr, int depth) {
    locals.put(expr, depth);
  }

  // ------------------------------------------------------------------ comandos

  private void execute(Ast.Stmt stmt) {
    switch (stmt) {
      case Ast.Block block -> executeBlock(block.statements(), new LoxRuntime.Environment(environment));
      case Ast.ClassDecl decl -> executeClass(decl);
      case Ast.Expression expression -> evaluate(expression.expression());
      case Ast.Function function -> environment.define(function.name().lexeme(), new LoxRuntime.Function(function, environment, false));
      case Ast.If ifStmt -> {
        if (isTruthy(evaluate(ifStmt.condition()))) execute(ifStmt.thenBranch());
        else if (ifStmt.elseBranch() != null) execute(ifStmt.elseBranch());
      }
      case Ast.Print print -> System.out.println(stringify(evaluate(print.expression())));
      case Ast.Return ret -> throw new ReturnValue(ret.value() == null ? null : evaluate(ret.value()));
      case Ast.Var var -> environment.define(var.name().lexeme(), var.initializer() == null ? null : evaluate(var.initializer()));
      case Ast.While loop -> {
        while (isTruthy(evaluate(loop.condition()))) execute(loop.body());
      }
    }
  }

  void executeBlock(List<Ast.Stmt> statements, LoxRuntime.Environment blockEnvironment) {
    LoxRuntime.Environment previous = environment;
    try {
      environment = blockEnvironment;
      for (Ast.Stmt statement : statements) execute(statement);
    } finally {
      environment = previous;
    }
  }

  private void executeClass(Ast.ClassDecl decl) {
    LoxRuntime.LoxClass superclass = null;
    if (decl.superclass() != null) {
      Object value = evaluate(decl.superclass());
      if (!(value instanceof LoxRuntime.LoxClass klass)) {
        throw new Lox.RuntimeError(decl.superclass().name(), "Superclass must be a class.");
      }
      superclass = klass;
    }
    environment.define(decl.name().lexeme(), null);
    if (superclass != null) {
      environment = new LoxRuntime.Environment(environment);
      environment.define("super", superclass);
    }
    Map<String, LoxRuntime.Function> methods = new HashMap<>();
    for (Ast.Function method : decl.methods()) {
      methods.put(method.name().lexeme(), new LoxRuntime.Function(method, environment, method.name().lexeme().equals("init")));
    }
    LoxRuntime.LoxClass klass = new LoxRuntime.LoxClass(decl.name().lexeme(), superclass, methods);
    if (superclass != null) environment = environment.enclosing;
    environment.assign(decl.name(), klass);
  }

  // --------------------------------------------------------------- expressões

  private Object evaluate(Ast.Expr expr) {
    return switch (expr) {
      case Ast.Literal literal -> literal.value();
      case Ast.Grouping grouping -> evaluate(grouping.expression());
      case Ast.Unary unary -> unary(unary);
      case Ast.Binary binary -> binary(binary);
      case Ast.Logical logical -> {
        Object left = evaluate(logical.left());
        if (logical.operator().type() == TokenType.OR) yield isTruthy(left) ? left : evaluate(logical.right());
        yield !isTruthy(left) ? left : evaluate(logical.right());
      }
      case Ast.Variable variable -> lookUpVariable(variable.name(), variable);
      case Ast.Assign assign -> {
        Object value = evaluate(assign.value());
        Integer distance = locals.get(assign);
        if (distance != null) environment.assignAt(distance, assign.name(), value);
        else globals.assign(assign.name(), value);
        yield value;
      }
      case Ast.Call call -> call(call);
      case Ast.Get get -> {
        Object object = evaluate(get.object());
        if (object instanceof LoxRuntime.Instance instance) yield instance.get(get.name());
        throw new Lox.RuntimeError(get.name(), "Only instances have properties.");
      }
      case Ast.SetField set -> {
        Object object = evaluate(set.object());
        if (!(object instanceof LoxRuntime.Instance instance)) {
          throw new Lox.RuntimeError(set.name(), "Only instances have fields.");
        }
        Object value = evaluate(set.value());
        instance.set(set.name(), value);
        yield value;
      }
      case Ast.This thisExpr -> lookUpVariable(thisExpr.keyword(), thisExpr);
      case Ast.Super superExpr -> {
        int distance = locals.get(superExpr);
        LoxRuntime.LoxClass superclass = (LoxRuntime.LoxClass) environment.getAt(distance, "super");
        LoxRuntime.Instance object = (LoxRuntime.Instance) environment.getAt(distance - 1, "this");
        LoxRuntime.Function method = superclass.findMethod(superExpr.method().lexeme());
        if (method == null) {
          throw new Lox.RuntimeError(superExpr.method(), "Undefined property '" + superExpr.method().lexeme() + "'.");
        }
        yield method.bind(object);
      }
    };
  }

  private Object unary(Ast.Unary unary) {
    Object right = evaluate(unary.right());
    return switch (unary.operator().type()) {
      case BANG -> !isTruthy(right);
      case MINUS -> {
        checkNumber(unary.operator(), right);
        yield -(double) right;
      }
      default -> null;
    };
  }

  private Object binary(Ast.Binary binary) {
    Object left = evaluate(binary.left());
    Object right = evaluate(binary.right());
    Token op = binary.operator();
    return switch (op.type()) {
      case PLUS -> {
        if (left instanceof Double a && right instanceof Double b) yield a + b;
        if (left instanceof String a && right instanceof String b) yield a + b;
        throw new Lox.RuntimeError(op, "Operands must be two numbers or two strings.");
      }
      case MINUS -> number(op, left, right, (a, b) -> a - b);
      case STAR -> number(op, left, right, (a, b) -> a * b);
      case SLASH -> number(op, left, right, (a, b) -> a / b);
      case GREATER -> compare(op, left, right) > 0;
      case GREATER_EQUAL -> compare(op, left, right) >= 0;
      case LESS -> compare(op, left, right) < 0;
      case LESS_EQUAL -> compare(op, left, right) <= 0;
      case EQUAL_EQUAL -> isEqual(left, right);
      case BANG_EQUAL -> !isEqual(left, right);
      default -> null;
    };
  }

  private interface NumberOp {
    double apply(double a, double b);
  }

  private Object number(Token op, Object left, Object right, NumberOp fn) {
    checkNumbers(op, left, right);
    return fn.apply((double) left, (double) right);
  }

  private int compare(Token op, Object left, Object right) {
    checkNumbers(op, left, right);
    return Double.compare((double) left, (double) right);
  }

  private Object call(Ast.Call call) {
    Object callee = evaluate(call.callee());
    List<Object> arguments = new ArrayList<>();
    for (Ast.Expr argument : call.arguments()) arguments.add(evaluate(argument));
    if (!(callee instanceof LoxRuntime.Callable function)) {
      throw new Lox.RuntimeError(call.paren(), "Can only call functions and classes.");
    }
    if (arguments.size() != function.arity()) {
      throw new Lox.RuntimeError(call.paren(), "Expected " + function.arity() + " arguments but got " + arguments.size() + ".");
    }
    return function.call(this, arguments);
  }

  private Object lookUpVariable(Token name, Ast.Expr expr) {
    Integer distance = locals.get(expr);
    return distance != null ? environment.getAt(distance, name.lexeme()) : globals.get(name);
  }

  // ------------------------------------------------------------------ apoio

  private static void checkNumber(Token op, Object operand) {
    if (!(operand instanceof Double)) throw new Lox.RuntimeError(op, "Operand must be a number.");
  }

  private static void checkNumbers(Token op, Object left, Object right) {
    if (!(left instanceof Double) || !(right instanceof Double)) {
      throw new Lox.RuntimeError(op, "Operands must be numbers.");
    }
  }

  static boolean isTruthy(Object value) {
    if (value == null) return false;
    if (value instanceof Boolean b) return b;
    return true;
  }

  private static boolean isEqual(Object a, Object b) {
    if (a == null) return b == null;
    return a.equals(b);
  }

  /** Números inteiros aparecem sem ".0"; nil aparece como nil. */
  static String stringify(Object value) {
    if (value == null) return "nil";
    if (value instanceof Double d) {
      String text = d.toString();
      return text.endsWith(".0") ? text.substring(0, text.length() - 2) : text;
    }
    return value.toString();
  }
}
