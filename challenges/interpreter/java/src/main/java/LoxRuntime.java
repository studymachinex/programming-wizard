import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Ambientes de variáveis e os valores "chamáveis" da linguagem: funções, classes e instâncias. */
final class LoxRuntime {
  private LoxRuntime() {}

  /** Um escopo: as variáveis dele e o escopo que o envolve. */
  static final class Environment {
    final Environment enclosing;
    private final Map<String, Object> values = new HashMap<>();

    Environment(Environment enclosing) {
      this.enclosing = enclosing;
    }

    void define(String name, Object value) {
      values.put(name, value);
    }

    Object get(Token name) {
      if (values.containsKey(name.lexeme())) return values.get(name.lexeme());
      if (enclosing != null) return enclosing.get(name);
      throw new Lox.RuntimeError(name, "Undefined variable '" + name.lexeme() + "'.");
    }

    void assign(Token name, Object value) {
      if (values.containsKey(name.lexeme())) {
        values.put(name.lexeme(), value);
      } else if (enclosing != null) {
        enclosing.assign(name, value);
      } else {
        throw new Lox.RuntimeError(name, "Undefined variable '" + name.lexeme() + "'.");
      }
    }

    Environment ancestor(int distance) {
      Environment environment = this;
      for (int i = 0; i < distance; i++) environment = environment.enclosing;
      return environment;
    }

    Object getAt(int distance, String name) {
      return ancestor(distance).values.get(name);
    }

    void assignAt(int distance, Token name, Object value) {
      ancestor(distance).values.put(name.lexeme(), value);
    }
  }

  interface Callable {
    int arity();

    Object call(Interpreter interpreter, List<Object> arguments);
  }

  /** Uma função declarada no programa, com o ambiente em que foi criada (closure). */
  static final class Function implements Callable {
    private final Ast.Function declaration;
    private final Environment closure;
    private final boolean isInitializer;

    Function(Ast.Function declaration, Environment closure, boolean isInitializer) {
      this.declaration = declaration;
      this.closure = closure;
      this.isInitializer = isInitializer;
    }

    Function bind(Instance instance) {
      Environment environment = new Environment(closure);
      environment.define("this", instance);
      return new Function(declaration, environment, isInitializer);
    }

    @Override
    public int arity() {
      return declaration.params().size();
    }

    @Override
    public Object call(Interpreter interpreter, List<Object> arguments) {
      Environment environment = new Environment(closure);
      for (int i = 0; i < declaration.params().size(); i++) {
        environment.define(declaration.params().get(i).lexeme(), arguments.get(i));
      }
      try {
        interpreter.executeBlock(declaration.body(), environment);
      } catch (Interpreter.ReturnValue returnValue) {
        return isInitializer ? closure.getAt(0, "this") : returnValue.value;
      }
      return isInitializer ? closure.getAt(0, "this") : null;
    }

    @Override
    public String toString() {
      return "<fn " + declaration.name().lexeme() + ">";
    }
  }

  static final class LoxClass implements Callable {
    final String name;
    final LoxClass superclass;
    private final Map<String, Function> methods;

    LoxClass(String name, LoxClass superclass, Map<String, Function> methods) {
      this.name = name;
      this.superclass = superclass;
      this.methods = methods;
    }

    Function findMethod(String method) {
      if (methods.containsKey(method)) return methods.get(method);
      return superclass != null ? superclass.findMethod(method) : null;
    }

    @Override
    public int arity() {
      Function initializer = findMethod("init");
      return initializer == null ? 0 : initializer.arity();
    }

    @Override
    public Object call(Interpreter interpreter, List<Object> arguments) {
      Instance instance = new Instance(this);
      Function initializer = findMethod("init");
      if (initializer != null) initializer.bind(instance).call(interpreter, arguments);
      return instance;
    }

    @Override
    public String toString() {
      return name;
    }
  }

  static final class Instance {
    private final LoxClass klass;
    private final Map<String, Object> fields = new HashMap<>();

    Instance(LoxClass klass) {
      this.klass = klass;
    }

    Object get(Token name) {
      if (fields.containsKey(name.lexeme())) return fields.get(name.lexeme());
      Function method = klass.findMethod(name.lexeme());
      if (method != null) return method.bind(this);
      throw new Lox.RuntimeError(name, "Undefined property '" + name.lexeme() + "'.");
    }

    void set(Token name, Object value) {
      fields.put(name.lexeme(), value);
    }

    @Override
    public String toString() {
      return klass.name + " instance";
    }
  }
}
