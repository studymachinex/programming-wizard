import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * Transforma uma linha digitada em um pipeline de comandos.
 *
 * Regras de quoting (um subconjunto do POSIX sh):
 *   - fora de aspas, espaços separam palavras e '\' preserva o próximo caractere;
 *   - entre aspas simples tudo é literal;
 *   - entre aspas duplas, '\' só escapa \ " $ e $NOME / ${NOME} é expandido.
 * Operadores reconhecidos fora de aspas: | > >> 1> 1>> 2> 2>> e & no final da linha.
 */
final class Parser {
  static final class Command {
    final List<String> argv = new ArrayList<>();
    String stdout;
    boolean stdoutAppend;
    String stderr;
    boolean stderrAppend;
  }

  static final class Pipeline {
    final List<Command> commands = new ArrayList<>();
    boolean background;
  }

  static final class ParseException extends Exception {
    ParseException(String message) {
      super(message);
    }
  }

  private record Token(boolean operator, String text) {}

  private Parser() {}

  static Pipeline parse(String line, Function<String, String> variables) throws ParseException {
    List<Token> tokens = tokenize(line, variables);
    Pipeline pipeline = new Pipeline();
    Command current = new Command();
    for (int i = 0; i < tokens.size(); i++) {
      Token token = tokens.get(i);
      if (!token.operator()) {
        current.argv.add(token.text());
        continue;
      }
      switch (token.text()) {
        case "|" -> {
          if (current.argv.isEmpty()) throw new ParseException("syntax error near unexpected token `|'");
          pipeline.commands.add(current);
          current = new Command();
        }
        case "&" -> {
          if (i != tokens.size() - 1) throw new ParseException("syntax error near unexpected token `&'");
          pipeline.background = true;
        }
        default -> {
          if (i + 1 >= tokens.size() || tokens.get(i + 1).operator()) {
            throw new ParseException("syntax error near unexpected token `newline'");
          }
          String target = tokens.get(++i).text();
          boolean append = token.text().endsWith(">>");
          if (token.text().startsWith("2")) {
            current.stderr = target;
            current.stderrAppend = append;
          } else {
            current.stdout = target;
            current.stdoutAppend = append;
          }
        }
      }
    }
    if (!current.argv.isEmpty()) pipeline.commands.add(current);
    else if (!pipeline.commands.isEmpty()) throw new ParseException("syntax error near unexpected token `|'");
    return pipeline;
  }

  private static List<Token> tokenize(String line, Function<String, String> variables) {
    List<Token> tokens = new ArrayList<>();
    StringBuilder word = new StringBuilder();
    boolean quoted = false; // a palavra teve aspas/escape: "" vira um argumento vazio
    int i = 0;
    while (i < line.length()) {
      char c = line.charAt(i);
      if (c == ' ' || c == '\t') {
        quoted = flush(tokens, word, quoted);
        i++;
      } else if (c == '\'') {
        int end = line.indexOf('\'', i + 1);
        if (end < 0) end = line.length();
        word.append(line, i + 1, end);
        quoted = true;
        i = end + 1;
      } else if (c == '"') {
        i++;
        while (i < line.length() && line.charAt(i) != '"') {
          char d = line.charAt(i);
          if (d == '\\' && i + 1 < line.length() && "\\\"$".indexOf(line.charAt(i + 1)) >= 0) {
            word.append(line.charAt(i + 1));
            i += 2;
          } else if (d == '$') {
            i = expand(line, i, word, variables);
          } else {
            word.append(d);
            i++;
          }
        }
        quoted = true;
        i++;
      } else if (c == '\\') {
        if (i + 1 < line.length()) word.append(line.charAt(i + 1));
        quoted = true;
        i += 2;
      } else if (c == '$') {
        i = expand(line, i, word, variables);
      } else if (c == '|' || c == '&') {
        quoted = flush(tokens, word, quoted);
        tokens.add(new Token(true, String.valueOf(c)));
        i++;
      } else if (c == '>') {
        String fd = "";
        if (!quoted && (word.toString().equals("1") || word.toString().equals("2"))) {
          fd = word.toString();
          word.setLength(0);
        }
        quoted = flush(tokens, word, quoted);
        boolean append = i + 1 < line.length() && line.charAt(i + 1) == '>';
        tokens.add(new Token(true, fd + (append ? ">>" : ">")));
        i += append ? 2 : 1;
      } else {
        word.append(c);
        i++;
      }
    }
    flush(tokens, word, quoted);
    return tokens;
  }

  private static boolean flush(List<Token> tokens, StringBuilder word, boolean quoted) {
    if (word.length() > 0 || quoted) tokens.add(new Token(false, word.toString()));
    word.setLength(0);
    return false;
  }

  /** Expande $NOME ou ${NOME} começando em line[i] == '$'; devolve o índice seguinte. */
  private static int expand(String line, int i, StringBuilder word, Function<String, String> variables) {
    int start = i + 1;
    if (start < line.length() && line.charAt(start) == '{') {
      int end = line.indexOf('}', start);
      if (end < 0) {
        word.append(line, i, line.length());
        return line.length();
      }
      word.append(variables.apply(line.substring(start + 1, end)));
      return end + 1;
    }
    int end = start;
    while (end < line.length() && isNameChar(line.charAt(end), end == start)) end++;
    if (end == start) {
      word.append('$');
      return start;
    }
    word.append(variables.apply(line.substring(start, end)));
    return end;
  }

  static boolean isNameChar(char c, boolean first) {
    return c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (!first && c >= '0' && c <= '9');
  }

  static boolean isValidName(String name) {
    if (name.isEmpty()) return false;
    for (int i = 0; i < name.length(); i++) {
      if (!isNameChar(name.charAt(i), i == 0)) return false;
    }
    return true;
  }
}
