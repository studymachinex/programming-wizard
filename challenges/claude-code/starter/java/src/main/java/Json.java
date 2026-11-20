import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JSON mínimo, só com a biblioteca padrão.
 *
 * parse(): objeto → Map<String, Object>, array → List<Object>, string → String,
 * número → Long ou Double, true/false → Boolean, null → null.
 * stringify(): o caminho inverso (aceita também Integer e outros Number).
 */
public final class Json {
  private final String text;
  private int pos;

  private Json(String text) {
    this.text = text;
  }

  public static Object parse(String text) {
    Json parser = new Json(text);
    parser.skipWhitespace();
    Object value = parser.readValue();
    parser.skipWhitespace();
    if (parser.pos != text.length()) throw parser.error("conteúdo extra depois do JSON");
    return value;
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> parseObject(String text) {
    return (Map<String, Object>) parse(text);
  }

  public static String stringify(Object value) {
    StringBuilder out = new StringBuilder();
    write(out, value);
    return out.toString();
  }

  /** Atalho para montar objetos: Json.obj("a", 1, "b", "x"). */
  public static Map<String, Object> obj(Object... pairs) {
    Map<String, Object> map = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) map.put((String) pairs[i], pairs[i + 1]);
    return map;
  }

  // ------------------------------------------------------------- parsing

  private Object readValue() {
    if (pos >= text.length()) throw error("fim inesperado");
    char c = text.charAt(pos);
    return switch (c) {
      case '{' -> readObject();
      case '[' -> readArray();
      case '"' -> readString();
      case 't' -> literal("true", Boolean.TRUE);
      case 'f' -> literal("false", Boolean.FALSE);
      case 'n' -> literal("null", null);
      default -> readNumber();
    };
  }

  private Map<String, Object> readObject() {
    Map<String, Object> map = new LinkedHashMap<>();
    pos++;
    skipWhitespace();
    if (peek() == '}') {
      pos++;
      return map;
    }
    while (true) {
      skipWhitespace();
      String key = readString();
      skipWhitespace();
      expect(':');
      skipWhitespace();
      map.put(key, readValue());
      skipWhitespace();
      char c = text.charAt(pos++);
      if (c == '}') return map;
      if (c != ',') throw error("esperava , ou }");
    }
  }

  private List<Object> readArray() {
    List<Object> list = new ArrayList<>();
    pos++;
    skipWhitespace();
    if (peek() == ']') {
      pos++;
      return list;
    }
    while (true) {
      skipWhitespace();
      list.add(readValue());
      skipWhitespace();
      char c = text.charAt(pos++);
      if (c == ']') return list;
      if (c != ',') throw error("esperava , ou ]");
    }
  }

  private String readString() {
    expect('"');
    StringBuilder out = new StringBuilder();
    while (true) {
      char c = text.charAt(pos++);
      if (c == '"') return out.toString();
      if (c != '\\') {
        out.append(c);
        continue;
      }
      char e = text.charAt(pos++);
      switch (e) {
        case '"', '\\', '/' -> out.append(e);
        case 'b' -> out.append('\b');
        case 'f' -> out.append('\f');
        case 'n' -> out.append('\n');
        case 'r' -> out.append('\r');
        case 't' -> out.append('\t');
        case 'u' -> {
          out.append((char) Integer.parseInt(text.substring(pos, pos + 4), 16));
          pos += 4;
        }
        default -> throw error("escape inválido \\" + e);
      }
    }
  }

  private Object readNumber() {
    int start = pos;
    while (pos < text.length() && "+-0123456789.eE".indexOf(text.charAt(pos)) >= 0) pos++;
    String number = text.substring(start, pos);
    if (number.isEmpty()) throw error("valor inválido");
    if (number.contains(".") || number.contains("e") || number.contains("E")) return Double.parseDouble(number);
    return Long.parseLong(number);
  }

  private Object literal(String word, Object value) {
    if (!text.startsWith(word, pos)) throw error("esperava " + word);
    pos += word.length();
    return value;
  }

  private void expect(char c) {
    if (pos >= text.length() || text.charAt(pos) != c) throw error("esperava " + c);
    pos++;
  }

  private char peek() {
    return pos < text.length() ? text.charAt(pos) : '\0';
  }

  private void skipWhitespace() {
    while (pos < text.length() && Character.isWhitespace(text.charAt(pos))) pos++;
  }

  private IllegalArgumentException error(String message) {
    return new IllegalArgumentException("JSON inválido na posição " + pos + ": " + message);
  }

  // ------------------------------------------------------------- writing

  private static void write(StringBuilder out, Object value) {
    if (value == null) {
      out.append("null");
    } else if (value instanceof String s) {
      writeString(out, s);
    } else if (value instanceof Boolean || value instanceof Number) {
      out.append(value);
    } else if (value instanceof Map<?, ?> map) {
      out.append('{');
      boolean first = true;
      for (Map.Entry<?, ?> entry : map.entrySet()) {
        if (!first) out.append(',');
        first = false;
        writeString(out, String.valueOf(entry.getKey()));
        out.append(':');
        write(out, entry.getValue());
      }
      out.append('}');
    } else if (value instanceof List<?> list) {
      out.append('[');
      for (int i = 0; i < list.size(); i++) {
        if (i > 0) out.append(',');
        write(out, list.get(i));
      }
      out.append(']');
    } else {
      throw new IllegalArgumentException("tipo não suportado: " + value.getClass());
    }
  }

  private static void writeString(StringBuilder out, String s) {
    out.append('"');
    for (char c : s.toCharArray()) {
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> {
          if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
          else out.append(c);
        }
      }
    }
    out.append('"');
  }
}
