import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.lang.annotation.Annotation;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Executor de testes do Programming Wizard.
 *
 * Roda os métodos @Test de uma classe no estilo JUnit 5 usando só reflexão — sem o launcher do
 * JUnit, o que deixa a execução leve e rápida. Suporta @Test, @BeforeEach, @AfterEach,
 * @DisplayName e @TempDir (campo ou parâmetro). As asserções vêm do junit-jupiter-api.
 *
 * Saída: uma linha por teste, prefixada com @@PW e codificada em JSON, para o servidor parsear
 * sem confundir com o que o código do aluno imprime.
 *
 * Uso: java -cp ... PwTestRunner SolutionTest [timeoutPorTesteMs]
 */
public final class PwTestRunner {
  private static final String MARK = "@@PW ";
  private static final int MAX_OUTPUT = 8_000;

  public static void main(String[] args) throws Exception {
    PrintStream realOut = new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out), true, StandardCharsets.UTF_8);
    String className = args[0];
    long timeoutMs = args.length > 1 ? Long.parseLong(args[1]) : 5_000;
    Class<?> testClass = Class.forName(className);

    List<Method> tests = new ArrayList<>();
    List<Method> before = new ArrayList<>();
    List<Method> after = new ArrayList<>();
    for (Method m : testClass.getDeclaredMethods()) {
      if (has(m, "org.junit.jupiter.api.Test")) tests.add(m);
      if (has(m, "org.junit.jupiter.api.BeforeEach")) before.add(m);
      if (has(m, "org.junit.jupiter.api.AfterEach")) after.add(m);
    }
    // Ordem estável e legível: a ordem de declaração não é garantida pela reflexão.
    tests.sort(Comparator.comparing(Method::getName));
    realOut.println(MARK + "{\"type\":\"start\",\"total\":" + tests.size() + "}");

    ExecutorService executor = Executors.newCachedThreadPool(r -> {
      Thread t = new Thread(r, "pw-test");
      t.setDaemon(true);
      return t;
    });
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;

    for (Method test : tests) {
      ByteArrayOutputStream captured = new ByteArrayOutputStream();
      PrintStream capture = new PrintStream(captured, true, StandardCharsets.UTF_8);
      System.setOut(capture);
      System.setErr(capture);
      long start = System.nanoTime();
      String status = "passed";
      String message = null;
      List<Path> tempDirs = new ArrayList<>();
      Future<?> future = executor.submit(() -> {
        Object instance = newInstance(testClass);
        injectTempDirs(instance, tempDirs);
        for (Method m : before) invoke(m, instance, tempDirs);
        try {
          invoke(test, instance, tempDirs);
        } finally {
          for (Method m : after) invoke(m, instance, tempDirs);
        }
        return null;
      });
      try {
        future.get(timeoutMs, TimeUnit.MILLISECONDS);
      } catch (TimeoutException e) {
        future.cancel(true);
        status = "timeout";
        message = "O teste passou de " + timeoutMs + " ms — loop infinito ou solução lenta demais?";
      } catch (ExecutionException e) {
        Throwable cause = unwrap(e.getCause());
        status = cause instanceof AssertionError ? "failed" : "error";
        message = describe(cause);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        status = "error";
        message = "interrompido";
      } finally {
        System.setOut(originalOut);
        System.setErr(originalErr);
        for (Path dir : tempDirs) deleteQuietly(dir);
      }
      long ms = (System.nanoTime() - start) / 1_000_000;
      String output = captured.toString(StandardCharsets.UTF_8);
      if (output.length() > MAX_OUTPUT) output = output.substring(0, MAX_OUTPUT) + "\n… (saída truncada)";
      realOut.println(MARK + "{\"type\":\"test\",\"name\":" + json(test.getName())
          + ",\"display\":" + json(displayName(test))
          + ",\"status\":" + json(status)
          + ",\"ms\":" + ms
          + ",\"message\":" + (message == null ? "null" : json(message))
          + ",\"output\":" + json(output) + "}");
    }
    realOut.println(MARK + "{\"type\":\"end\"}");
    realOut.flush();
    // Threads presas em loops infinitos não podem segurar a JVM.
    System.exit(0);
  }

  private static boolean has(java.lang.reflect.AnnotatedElement element, String annotation) {
    for (Annotation a : element.getAnnotations()) {
      if (a.annotationType().getName().equals(annotation)) return true;
    }
    return false;
  }

  private static Object newInstance(Class<?> type) throws Exception {
    Constructor<?> ctor = type.getDeclaredConstructor();
    ctor.setAccessible(true);
    return ctor.newInstance();
  }

  private static void injectTempDirs(Object instance, List<Path> created) throws Exception {
    for (Field f : instance.getClass().getDeclaredFields()) {
      if (has(f, "org.junit.jupiter.api.io.TempDir")) {
        f.setAccessible(true);
        Path dir = Files.createTempDirectory("pw-tempdir-");
        created.add(dir);
        f.set(instance, f.getType() == java.io.File.class ? dir.toFile() : dir);
      }
    }
  }

  /** Repassa a falha do teste sem embrulhar (AssertionError continua sendo AssertionError). */
  private static void invoke(Method m, Object instance, List<Path> tempDirs) throws Exception {
    try {
      invokeRaw(m, instance, tempDirs);
    } catch (Exception | Error e) {
      throw e;
    } catch (Throwable t) {
      throw new RuntimeException(t);
    }
  }

  private static void invokeRaw(Method m, Object instance, List<Path> tempDirs) throws Throwable {
    m.setAccessible(true);
    Parameter[] params = m.getParameters();
    Object[] values = new Object[params.length];
    for (int i = 0; i < params.length; i++) {
      if (has(params[i], "org.junit.jupiter.api.io.TempDir")) {
        Path dir = Files.createTempDirectory("pw-tempdir-");
        tempDirs.add(dir);
        values[i] = params[i].getType() == java.io.File.class ? dir.toFile() : dir;
      } else {
        throw new IllegalStateException("parâmetro não suportado em " + m.getName() + ": " + params[i].getType().getSimpleName());
      }
    }
    try {
      m.invoke(instance, values);
    } catch (InvocationTargetException e) {
      throw e.getCause();
    }
  }

  private static String displayName(Method m) {
    for (Annotation a : m.getAnnotations()) {
      if (a.annotationType().getName().equals("org.junit.jupiter.api.DisplayName")) {
        try {
          return (String) a.annotationType().getMethod("value").invoke(a);
        } catch (ReflectiveOperationException ignored) {
          // cai no nome do método
        }
      }
    }
    // contaLinhasErros -> "conta linhas erros"
    return m.getName().replaceAll("([a-z0-9])([A-Z])", "$1 $2").replace('_', ' ').toLowerCase();
  }

  private static Throwable unwrap(Throwable t) {
    while ((t instanceof InvocationTargetException || t instanceof ExecutionException) && t.getCause() != null) t = t.getCause();
    return t;
  }

  /** Mensagem curta + as linhas do stack trace que apontam para o código do aluno. */
  private static String describe(Throwable t) {
    StringBuilder sb = new StringBuilder();
    sb.append(t instanceof AssertionError ? "" : t.getClass().getSimpleName() + ": ");
    sb.append(t.getMessage() == null ? "(sem mensagem)" : t.getMessage());
    Arrays.stream(t.getStackTrace())
        .filter(e -> e.getFileName() != null && (e.getFileName().startsWith("Solution") || !e.getClassName().contains(".")))
        .filter(e -> !e.getClassName().equals("PwTestRunner"))
        .limit(4)
        .forEach(e -> sb.append("\n  em ").append(e.getClassName()).append('.').append(e.getMethodName())
            .append('(').append(e.getFileName()).append(':').append(e.getLineNumber()).append(')'));
    return sb.toString();
  }

  private static void deleteQuietly(Path dir) {
    try (var walk = Files.walk(dir)) {
      walk.sorted(Comparator.reverseOrder()).forEach(p -> {
        try {
          Files.deleteIfExists(p);
        } catch (java.io.IOException ignored) {
          // arquivo preso: o diretório temporário do sistema limpa depois
        }
      });
    } catch (java.io.IOException ignored) {
      // idem
    }
  }

  private static String json(String s) {
    StringBuilder sb = new StringBuilder("\"");
    for (char c : s.toCharArray()) {
      switch (c) {
        case '"' -> sb.append("\\\"");
        case '\\' -> sb.append("\\\\");
        case '\n' -> sb.append("\\n");
        case '\r' -> sb.append("\\r");
        case '\t' -> sb.append("\\t");
        default -> {
          if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
          else sb.append(c);
        }
      }
    }
    return sb.append('"').toString();
  }
}
