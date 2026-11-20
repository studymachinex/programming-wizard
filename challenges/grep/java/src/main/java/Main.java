import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntPredicate;
import java.util.stream.Stream;

/**
 * Implementação de referência do desafio "Build your own grep" (33 stages).
 *
 * Um grep -E com motor de expressões regulares próprio (backtracking), sem java.util.regex.
 * Uso: your_program.sh [-o] [-r] [--color=always|never|auto] -E <padrão> [arquivos...]
 */
public class Main {
  static final PrintStream OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);
  static final String COLOR_START = "\u001b[01;31m\u001b[K";
  static final String COLOR_END = "\u001b[m\u001b[K";

  public static void main(String[] args) throws IOException {
    String pattern = null;
    boolean onlyMatching = false;
    boolean recursive = false;
    String color = "never";
    List<String> paths = new ArrayList<>();
    for (int i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "-E" -> pattern = args[++i];
        case "-o" -> onlyMatching = true;
        case "-r" -> recursive = true;
        default -> {
          if (args[i].startsWith("--color=")) color = args[i].substring("--color=".length());
          else paths.add(args[i]);
        }
      }
    }
    if (pattern == null) {
      System.err.println("uso: your_program.sh [-o] [-r] [--color=WHEN] -E <padrão> [arquivos...]");
      System.exit(2);
    }

    Regex regex;
    try {
      regex = Regex.compile(pattern);
    } catch (IllegalArgumentException error) {
      System.err.println("padrão inválido: " + error.getMessage());
      System.exit(2);
      return;
    }
    boolean highlight = color.equals("always") || (color.equals("auto") && stdoutIsTerminal());

    List<Source> sources = new ArrayList<>();
    if (paths.isEmpty()) {
      sources.add(new Source(null, new String(System.in.readAllBytes(), StandardCharsets.UTF_8)));
    } else {
      for (String path : paths) collect(path, recursive, sources);
    }
    boolean prefix = recursive || sources.size() > 1;

    boolean matched = false;
    for (Source source : sources) {
      String text = source.text().replace("\r\n", "\n");
      if (text.endsWith("\n")) text = text.substring(0, text.length() - 1);
      if (text.isEmpty() && source.name() != null) continue;
      for (String line : text.split("\n", -1)) {
        List<int[]> matches = regex.findAll(line);
        if (matches.isEmpty()) continue;
        matched = true;
        String head = prefix ? source.name() + ":" : "";
        if (onlyMatching) {
          for (int[] m : matches) {
            if (m[1] == m[0]) continue;
            String part = line.substring(m[0], m[1]);
            OUT.println(head + (highlight ? COLOR_START + part + COLOR_END : part));
          }
        } else if (highlight) {
          StringBuilder out = new StringBuilder();
          int last = 0;
          for (int[] m : matches) {
            if (m[1] == m[0]) continue;
            out.append(line, last, m[0]).append(COLOR_START).append(line, m[0], m[1]).append(COLOR_END);
            last = m[1];
          }
          out.append(line.substring(last));
          OUT.println(head + out);
        } else {
          OUT.println(head + line);
        }
      }
    }
    OUT.flush();
    System.exit(matched ? 0 : 1);
  }

  record Source(String name, String text) {}

  static void collect(String path, boolean recursive, List<Source> out) throws IOException {
    Path p = Path.of(path);
    if (Files.isDirectory(p)) {
      if (!recursive) {
        System.err.println("grep: " + path + ": é um diretório");
        return;
      }
      String base = path;
      while (base.endsWith("/") || base.endsWith("\\")) base = base.substring(0, base.length() - 1);
      try (Stream<Path> walk = Files.walk(p)) {
        for (Path file : walk.filter(Files::isRegularFile).sorted().toList()) {
          String relative = p.relativize(file).toString().replace('\\', '/');
          out.add(new Source(base + "/" + relative, Files.readString(file, StandardCharsets.UTF_8)));
        }
      }
    } else {
      out.add(new Source(path, Files.readString(p, StandardCharsets.UTF_8)));
    }
  }

  /** Java 22+ tem Console.isTerminal(); antes disso, System.console() é null fora de um terminal. */
  static boolean stdoutIsTerminal() {
    var console = System.console();
    if (console == null) return false;
    try {
      return (Boolean) console.getClass().getMethod("isTerminal").invoke(console);
    } catch (ReflectiveOperationException error) {
      return true;
    }
  }

  // ------------------------------------------------------------- motor

  interface Node {}

  record CharClass(IntPredicate test) implements Node {}

  record Start() implements Node {}

  record End() implements Node {}

  record Group(List<List<Node>> alternatives, int index) implements Node {}

  record Backref(int index) implements Node {}

  record Repeat(Node node, int min, int max) implements Node {}

  interface Cont {
    boolean run(int pos);
  }

  static final class Regex {
    final List<Node> sequence;
    final int groupCount;
    String input;
    int[] starts;
    int[] ends;

    Regex(List<Node> sequence, int groupCount) {
      this.sequence = sequence;
      this.groupCount = groupCount;
    }

    static Regex compile(String pattern) {
      Parser parser = new Parser(pattern);
      List<List<Node>> alternatives = parser.alternatives();
      if (parser.pos < pattern.length()) throw new IllegalArgumentException("')' sem '(' na posição " + parser.pos);
      List<Node> root = List.of(new Group(alternatives, 0));
      return new Regex(root, parser.groups);
    }

    /** Todas as ocorrências não sobrepostas, da esquerda para a direita. */
    List<int[]> findAll(String line) {
      List<int[]> result = new ArrayList<>();
      int from = 0;
      while (from <= line.length()) {
        int[] m = matchAt(line, from);
        if (m == null) break;
        result.add(m);
        from = m[1] > m[0] ? m[1] : m[0] + 1;
      }
      return result;
    }

    int[] matchAt(String line, int from) {
      input = line;
      for (int start = from; start <= line.length(); start++) {
        starts = new int[groupCount + 1];
        ends = new int[groupCount + 1];
        java.util.Arrays.fill(starts, -1);
        java.util.Arrays.fill(ends, -1);
        int[] end = {-1};
        if (seq(sequence, 0, start, pos -> {
          end[0] = pos;
          return true;
        })) {
          return new int[] {start, end[0]};
        }
      }
      return null;
    }

    boolean seq(List<Node> nodes, int index, int pos, Cont k) {
      if (index == nodes.size()) return k.run(pos);
      return node(nodes.get(index), pos, next -> seq(nodes, index + 1, next, k));
    }

    boolean node(Node n, int pos, Cont k) {
      if (n instanceof CharClass c) {
        return pos < input.length() && c.test().test(input.charAt(pos)) && k.run(pos + 1);
      }
      if (n instanceof Start) return pos == 0 && k.run(pos);
      if (n instanceof End) return pos == input.length() && k.run(pos);
      if (n instanceof Group g) {
        for (List<Node> alternative : g.alternatives()) {
          int oldStart = starts[g.index()];
          int oldEnd = ends[g.index()];
          if (seq(alternative, 0, pos, end -> {
            int savedStart = starts[g.index()];
            int savedEnd = ends[g.index()];
            starts[g.index()] = pos;
            ends[g.index()] = end;
            if (k.run(end)) return true;
            starts[g.index()] = savedStart;
            ends[g.index()] = savedEnd;
            return false;
          })) {
            return true;
          }
          starts[g.index()] = oldStart;
          ends[g.index()] = oldEnd;
        }
        return false;
      }
      if (n instanceof Backref b) {
        if (starts[b.index()] < 0) return false;
        String captured = input.substring(starts[b.index()], ends[b.index()]);
        return input.startsWith(captured, pos) && k.run(pos + captured.length());
      }
      if (n instanceof Repeat r) return repeat(r, 0, pos, k);
      throw new IllegalStateException("nó desconhecido: " + n);
    }

    /** Guloso: tenta mais uma repetição antes de devolver o controle à continuação. */
    boolean repeat(Repeat r, int count, int pos, Cont k) {
      if (count < r.max() && node(r.node(), pos, next -> next != pos && repeat(r, count + 1, next, k))) return true;
      return count >= r.min() && k.run(pos);
    }
  }

  static final class Parser {
    final String p;
    int pos;
    int groups;

    Parser(String pattern) {
      this.p = pattern;
    }

    List<List<Node>> alternatives() {
      List<List<Node>> alternatives = new ArrayList<>();
      alternatives.add(sequence());
      while (pos < p.length() && p.charAt(pos) == '|') {
        pos++;
        alternatives.add(sequence());
      }
      return alternatives;
    }

    List<Node> sequence() {
      List<Node> nodes = new ArrayList<>();
      while (pos < p.length() && p.charAt(pos) != '|' && p.charAt(pos) != ')') {
        Node atom = atom();
        nodes.add(quantifier(atom));
      }
      return nodes;
    }

    Node atom() {
      char c = p.charAt(pos++);
      switch (c) {
        case '^':
          return new Start();
        case '$':
          return new End();
        case '.':
          return new CharClass(ch -> ch != '\n');
        case '(': {
          int index = ++groups;
          List<List<Node>> alternatives = alternatives();
          if (pos >= p.length() || p.charAt(pos) != ')') throw new IllegalArgumentException("'(' sem ')'");
          pos++;
          return new Group(alternatives, index);
        }
        case '[':
          return bracket();
        case '\\':
          return escape();
        default:
          return literal(c);
      }
    }

    Node escape() {
      if (pos >= p.length()) throw new IllegalArgumentException("'\\' no fim do padrão");
      char e = p.charAt(pos++);
      if (e >= '1' && e <= '9') return new Backref(e - '0');
      IntPredicate cls = escapeClass(e);
      return cls != null ? new CharClass(cls) : literal(e);
    }

    static IntPredicate escapeClass(char e) {
      return switch (e) {
        case 'd' -> ch -> ch >= '0' && ch <= '9';
        case 'w' -> ch -> Character.isLetterOrDigit(ch) && ch < 128 || ch == '_';
        case 's' -> ch -> ch == ' ' || ch == '\t';
        default -> null;
      };
    }

    static Node literal(char c) {
      return new CharClass(ch -> ch == c);
    }

    Node bracket() {
      boolean negated = pos < p.length() && p.charAt(pos) == '^';
      if (negated) pos++;
      List<IntPredicate> parts = new ArrayList<>();
      boolean first = true;
      while (pos < p.length() && (p.charAt(pos) != ']' || first)) {
        first = false;
        char c = p.charAt(pos++);
        if (c == '\\' && pos < p.length()) {
          char e = p.charAt(pos++);
          IntPredicate cls = escapeClass(e);
          parts.add(cls != null ? cls : ch -> ch == e);
        } else if (pos + 1 < p.length() && p.charAt(pos) == '-' && p.charAt(pos + 1) != ']') {
          char to = p.charAt(pos + 1);
          pos += 2;
          parts.add(ch -> ch >= c && ch <= to);
        } else {
          parts.add(ch -> ch == c);
        }
      }
      if (pos >= p.length()) throw new IllegalArgumentException("'[' sem ']'");
      pos++;
      IntPredicate any = ch -> parts.stream().anyMatch(part -> part.test(ch));
      return new CharClass(negated ? any.negate() : any);
    }

    Node quantifier(Node atom) {
      if (pos >= p.length()) return atom;
      char q = p.charAt(pos);
      switch (q) {
        case '+':
          pos++;
          return new Repeat(atom, 1, Integer.MAX_VALUE);
        case '*':
          pos++;
          return new Repeat(atom, 0, Integer.MAX_VALUE);
        case '?':
          pos++;
          return new Repeat(atom, 0, 1);
        case '{': {
          int close = p.indexOf('}', pos);
          if (close < 0) return atom;
          String body = p.substring(pos + 1, close);
          int min;
          int max;
          int comma = body.indexOf(',');
          try {
            if (comma < 0) {
              min = max = Integer.parseInt(body);
            } else {
              min = Integer.parseInt(body.substring(0, comma));
              String rest = body.substring(comma + 1);
              max = rest.isEmpty() ? Integer.MAX_VALUE : Integer.parseInt(rest);
            }
          } catch (NumberFormatException notQuantifier) {
            return atom;
          }
          pos = close + 1;
          return new Repeat(atom, min, max);
        }
        default:
          return atom;
      }
    }
  }
}
