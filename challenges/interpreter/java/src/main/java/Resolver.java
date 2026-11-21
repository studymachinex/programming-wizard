import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Análise estática antes da execução: decide a que declaração cada variável se refere (a
 * distância em escopos) e encontra erros que dá para ver sem rodar o programa.
 */
final class Resolver {
  private enum FunctionType { NONE, FUNCTION, INITIALIZER, METHOD }

  private enum ClassType { NONE, CLASS, SUBCLASS }

  private final Interpreter interpreter;
  /** Cada escopo: nome → já terminou de ser definido? */
  private final Deque<Map<String, Boolean>> scopes = new ArrayDeque<>();
  private FunctionType currentFunction = FunctionType.NONE;
  private ClassType currentClass = ClassType.NONE;

  Resolver(Interpreter interpreter) {
    this.interpreter = interpreter;
  }

  void resolve(List<Ast.Stmt> statements) {
    for (Ast.Stmt statement : statements) resolve(statement);
  }

  private void resolve(Ast.Stmt stmt) {
    switch (stmt) {
      case Ast.Block block -> {
        beginScope();
        resolve(block.statements());
        endScope();
      }
      case Ast.ClassDecl decl -> resolveClass(decl);
      case Ast.Expression expression -> resolve(expression.expression());
      case Ast.Function function -> {
        declare(function.name());
        define(function.name());
        resolveFunction(function, FunctionType.FUNCTION);
      }
      case Ast.If ifStmt -> {
        resolve(ifStmt.condition());
        resolve(ifStmt.thenBranch());
        if (ifStmt.elseBranch() != null) resolve(ifStmt.elseBranch());
      }
      case Ast.Print print -> resolve(print.expression());
      case Ast.Return ret -> {
        if (currentFunction == FunctionType.NONE) Lox.error(ret.keyword(), "Can't return from top-level code.");
        if (ret.value() != null) {
          if (currentFunction == FunctionType.INITIALIZER) {
            Lox.error(ret.keyword(), "Can't return a value from an initializer.");
          }
          resolve(ret.value());
        }
      }
      case Ast.Var var -> {
        declare(var.name());
        if (var.initializer() != null) resolve(var.initializer());
        define(var.name());
      }
      case Ast.While loop -> {
        resolve(loop.condition());
        resolve(loop.body());
      }
    }
  }

  private void resolveClass(Ast.ClassDecl decl) {
    ClassType enclosingClass = currentClass;
    currentClass = ClassType.CLASS;
    declare(decl.name());
    define(decl.name());

    if (decl.superclass() != null) {
      if (decl.name().lexeme().equals(decl.superclass().name().lexeme())) {
        Lox.error(decl.superclass().name(), "A class can't inherit from itself.");
      }
      currentClass = ClassType.SUBCLASS;
      resolve(decl.superclass());
      beginScope();
      scopes.peek().put("super", true);
    }

    beginScope();
    scopes.peek().put("this", true);
    for (Ast.Function method : decl.methods()) {
      FunctionType type = method.name().lexeme().equals("init") ? FunctionType.INITIALIZER : FunctionType.METHOD;
      resolveFunction(method, type);
    }
    endScope();

    if (decl.superclass() != null) endScope();
    currentClass = enclosingClass;
  }

  private void resolveFunction(Ast.Function function, FunctionType type) {
    FunctionType enclosingFunction = currentFunction;
    currentFunction = type;
    beginScope();
    for (Token param : function.params()) {
      declare(param);
      define(param);
    }
    resolve(function.body());
    endScope();
    currentFunction = enclosingFunction;
  }

  private void resolve(Ast.Expr expr) {
    switch (expr) {
      case Ast.Variable variable -> {
        if (!scopes.isEmpty() && scopes.peek().get(variable.name().lexeme()) == Boolean.FALSE) {
          Lox.error(variable.name(), "Can't read local variable in its own initializer.");
        }
        resolveLocal(expr, variable.name());
      }
      case Ast.Assign assign -> {
        resolve(assign.value());
        resolveLocal(expr, assign.name());
      }
      case Ast.Binary binary -> {
        resolve(binary.left());
        resolve(binary.right());
      }
      case Ast.Logical logical -> {
        resolve(logical.left());
        resolve(logical.right());
      }
      case Ast.Call call -> {
        resolve(call.callee());
        for (Ast.Expr argument : call.arguments()) resolve(argument);
      }
      case Ast.Get get -> resolve(get.object());
      case Ast.SetField set -> {
        resolve(set.value());
        resolve(set.object());
      }
      case Ast.Grouping grouping -> resolve(grouping.expression());
      case Ast.Literal literal -> { }
      case Ast.Unary unary -> resolve(unary.right());
      case Ast.This thisExpr -> {
        if (currentClass == ClassType.NONE) {
          Lox.error(thisExpr.keyword(), "Can't use 'this' outside of a class.");
          return;
        }
        resolveLocal(expr, thisExpr.keyword());
      }
      case Ast.Super superExpr -> {
        if (currentClass == ClassType.NONE) {
          Lox.error(superExpr.keyword(), "Can't use 'super' outside of a class.");
        } else if (currentClass != ClassType.SUBCLASS) {
          Lox.error(superExpr.keyword(), "Can't use 'super' in a class with no superclass.");
        }
        resolveLocal(expr, superExpr.keyword());
      }
    }
  }

  private void resolveLocal(Ast.Expr expr, Token name) {
    int depth = 0;
    for (Map<String, Boolean> scope : scopes) { // do escopo mais interno para o mais externo
      if (scope.containsKey(name.lexeme())) {
        interpreter.resolve(expr, depth);
        return;
      }
      depth++;
    }
    // não achou: é global
  }

  private void beginScope() {
    scopes.push(new HashMap<>());
  }

  private void endScope() {
    scopes.pop();
  }

  private void declare(Token name) {
    if (scopes.isEmpty()) return;
    Map<String, Boolean> scope = scopes.peek();
    if (scope.containsKey(name.lexeme())) Lox.error(name, "Already a variable with this name in this scope.");
    scope.put(name.lexeme(), false);
  }

  private void define(Token name) {
    if (scopes.isEmpty()) return;
    scopes.peek().put(name.lexeme(), true);
  }
}
