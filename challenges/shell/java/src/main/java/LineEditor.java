import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/**
 * Editor de linha mínimo, no estilo do readline em modo raw.
 *
 * Não existe terminal no meio: os bytes chegam do stdin exatamente como foram digitados, e é
 * o shell quem ecoa cada tecla. Teclas tratadas: caracteres imprimíveis, Enter (\n ou \r),
 * Backspace, Tab (autocompletar), setas ↑/↓ (histórico) e Ctrl-D numa linha vazia (EOF).
 */
final class LineEditor {
  /** Um candidato de autocompletar: o texto que substitui a palavra e como ele aparece na lista. */
  record Candidate(String text, String display, boolean directory) {}

  /** A palavra sob o cursor e os candidatos para ela. */
  record Completion(String word, List<Candidate> candidates) {}

  interface Completer {
    Completion complete(String line);
  }

  private static final String BELL = "\u0007";

  private final InputStream in;
  private final PrintStream out;
  private final Completer completer;
  private final List<String> history;
  private boolean skipLineFeed;

  LineEditor(InputStream in, PrintStream out, Completer completer, List<String> history) {
    this.in = in;
    this.out = out;
    this.completer = completer;
    this.history = history;
  }

  /** Lê uma linha; devolve null no fim da entrada. */
  String readLine(String prompt) throws IOException {
    StringBuilder line = new StringBuilder();
    int historyIndex = history.size();
    String draft = "";
    boolean lastWasTab = false;

    while (true) {
      int c = in.read();
      if (c == -1) return line.length() > 0 ? line.toString() : null;
      if (c == '\n' && skipLineFeed) {
        skipLineFeed = false;
        continue;
      }
      skipLineFeed = c == '\r';
      boolean isTab = c == '\t';

      if (c == '\n' || c == '\r') {
        write("\n");
        return line.toString();
      } else if (isTab) {
        // um Tab que alterou a linha não conta como "Tab anterior" para listar candidatos
        if (complete(prompt, line, lastWasTab)) isTab = false;
      } else if (c == 127 || c == 8) {
        if (line.length() > 0) {
          line.setLength(line.length() - 1);
          write("\b \b");
        }
      } else if (c == 4) {
        if (line.length() == 0) return null;
      } else if (c == 27) {
        int next = in.read();
        if (next != '[' && next != 'O') continue;
        int key = in.read();
        if (key == 'A' && historyIndex > 0) {
          if (historyIndex == history.size()) draft = line.toString();
          historyIndex--;
          replace(prompt, line, history.get(historyIndex));
        } else if (key == 'B' && historyIndex < history.size()) {
          historyIndex++;
          replace(prompt, line, historyIndex == history.size() ? draft : history.get(historyIndex));
        }
      } else if (c >= 32) {
        String text = decodeUtf8(c);
        line.append(text);
        write(text);
      }
      lastWasTab = isTab;
    }
  }

  /** Devolve true se a linha mudou. */
  private boolean complete(String prompt, StringBuilder line, boolean secondTab) {
    Completion completion = completer.complete(line.toString());
    String word = completion.word();
    List<Candidate> candidates = completion.candidates();
    if (candidates.isEmpty()) {
      write(BELL);
      return false;
    }
    if (candidates.size() == 1) {
      Candidate only = candidates.get(0);
      replaceWord(prompt, line, word, only.text() + (only.directory() ? "/" : " "));
      return true;
    }
    List<String> texts = new ArrayList<>();
    for (Candidate candidate : candidates) texts.add(candidate.text());
    String prefix = commonPrefix(texts);
    if (prefix.length() > word.length() && prefix.startsWith(word)) {
      replaceWord(prompt, line, word, prefix);
      return true;
    } else if (secondTab) {
      TreeSet<String> shown = new TreeSet<>();
      for (Candidate candidate : candidates) shown.add(candidate.display());
      write("\n" + String.join("  ", shown) + "\n" + prompt + line);
    } else {
      write(BELL);
    }
    return false;
  }

  private void replaceWord(String prompt, StringBuilder line, String word, String replacement) {
    String before = line.substring(0, line.length() - word.length());
    if (replacement.startsWith(word)) {
      line.append(replacement.substring(word.length()));
      write(replacement.substring(word.length()));
    } else {
      replace(prompt, line, before + replacement);
    }
  }

  /** Troca a linha inteira: volta ao começo, apaga e redesenha prompt + texto. */
  private void replace(String prompt, StringBuilder line, String text) {
    line.setLength(0);
    line.append(text);
    write("\r\u001b[K" + prompt + text);
  }

  static String commonPrefix(List<String> values) {
    String prefix = values.get(0);
    for (String value : values) {
      int i = 0;
      while (i < prefix.length() && i < value.length() && prefix.charAt(i) == value.charAt(i)) i++;
      prefix = prefix.substring(0, i);
    }
    return prefix;
  }

  private String decodeUtf8(int first) throws IOException {
    int extra = first >= 0xF0 ? 3 : first >= 0xE0 ? 2 : first >= 0xC0 ? 1 : 0;
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    bytes.write(first);
    for (int i = 0; i < extra; i++) {
      int next = in.read();
      if (next == -1) break;
      bytes.write(next);
    }
    return bytes.toString(StandardCharsets.UTF_8);
  }

  private void write(String text) {
    out.print(text);
    out.flush();
  }
}
