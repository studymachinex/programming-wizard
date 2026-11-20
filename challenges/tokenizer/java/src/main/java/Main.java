import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Implementação de referência do desafio "Build your own Tokenizer" (8 stages).
 *
 * Um tokenizer BPE (byte pair encoding) do zero, até reproduzir os token IDs do GPT-2.
 * Toda entrada chega pelo stdin; os argumentos escolhem o comando.
 */
public class Main {
  static final PrintStream OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);

  /** Pré-tokenização do GPT-2. UNICODE_CHARACTER_CLASS faz \s cobrir espaços Unicode, como no original. */
  static final Pattern GPT2_SPLIT = Pattern.compile(
      "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+",
      Pattern.UNICODE_CHARACTER_CLASS);

  record Merge(int a, int b, int id) {}

  public static void main(String[] args) throws IOException {
    if (args.length == 0) {
      System.err.println("uso: your_program.sh <comando> [<args>...] < entrada");
      System.exit(1);
    }
    byte[] input = System.in.readAllBytes();
    switch (args[0]) {
      case "bytes" -> OUT.println(join(toIds(input)));
      case "pair" -> {
        int[] pair = mostFrequentPair(parseIds(input));
        if (pair != null) OUT.println(pair[0] + " " + pair[1]);
      }
      case "merge" -> OUT.println(join(merge(parseIds(input),
          Integer.parseInt(args[1]), Integer.parseInt(args[2]), Integer.parseInt(args[3]))));
      case "train" -> {
        for (Merge m : train(toIds(input), Integer.parseInt(args[1]))) {
          OUT.println(m.a() + " " + m.b() + " -> " + m.id());
        }
      }
      case "encode" -> OUT.println(join(encode(toIds(input), readMerges(Path.of(args[1])))));
      case "decode" -> OUT.write(decode(parseIds(input), readMerges(Path.of(args[1]))));
      case "split" -> {
        for (String chunk : split(new String(input, StandardCharsets.UTF_8))) OUT.println(jsonString(chunk));
      }
      case "gpt2" -> OUT.println(join(gpt2Encode(new String(input, StandardCharsets.UTF_8), Path.of(args[1]))));
      default -> {
        System.err.println("Unknown command: " + args[0]);
        System.exit(1);
      }
    }
    OUT.flush();
  }

  // ------------------------------------------------------------ helpers

  static List<Integer> toIds(byte[] bytes) {
    List<Integer> ids = new ArrayList<>(bytes.length);
    for (byte b : bytes) ids.add(b & 0xff);
    return ids;
  }

  static List<Integer> parseIds(byte[] input) {
    List<Integer> ids = new ArrayList<>();
    for (String token : new String(input, StandardCharsets.US_ASCII).trim().split("\\s+")) {
      if (!token.isEmpty()) ids.add(Integer.parseInt(token));
    }
    return ids;
  }

  static String join(List<Integer> ids) {
    StringBuilder out = new StringBuilder();
    for (int i = 0; i < ids.size(); i++) {
      if (i > 0) out.append(' ');
      out.append(ids.get(i));
    }
    return out.toString();
  }

  // ------------------------------------------------------- stages 2 e 3

  /** Par adjacente mais frequente; empate → o par que aparece primeiro na sequência. */
  static int[] mostFrequentPair(List<Integer> ids) {
    Map<Long, Integer> counts = new LinkedHashMap<>();
    for (int i = 0; i + 1 < ids.size(); i++) {
      counts.merge(key(ids.get(i), ids.get(i + 1)), 1, Integer::sum);
    }
    long best = -1;
    int bestCount = 0;
    for (Map.Entry<Long, Integer> entry : counts.entrySet()) {
      if (entry.getValue() > bestCount) {
        best = entry.getKey();
        bestCount = entry.getValue();
      }
    }
    return best < 0 ? null : new int[] {(int) (best >> 32), (int) best};
  }

  static long key(int a, int b) {
    return ((long) a << 32) | (b & 0xffffffffL);
  }

  /** Substitui, da esquerda para a direita e sem sobreposição, cada (a, b) por id. */
  static List<Integer> merge(List<Integer> ids, int a, int b, int id) {
    List<Integer> out = new ArrayList<>(ids.size());
    int i = 0;
    while (i < ids.size()) {
      if (i + 1 < ids.size() && ids.get(i) == a && ids.get(i + 1) == b) {
        out.add(id);
        i += 2;
      } else {
        out.add(ids.get(i));
        i += 1;
      }
    }
    return out;
  }

  // ------------------------------------------------------- stages 4 a 6

  static List<Merge> train(List<Integer> ids, int vocabSize) {
    List<Merge> merges = new ArrayList<>();
    for (int id = 256; id < vocabSize && ids.size() >= 2; id++) {
      int[] pair = mostFrequentPair(ids);
      ids = merge(ids, pair[0], pair[1], id);
      merges.add(new Merge(pair[0], pair[1], id));
    }
    return merges;
  }

  static List<Merge> readMerges(Path file) throws IOException {
    List<Merge> merges = new ArrayList<>();
    for (String line : Files.readAllLines(file)) {
      line = line.trim();
      if (line.isEmpty()) continue;
      String[] parts = line.split("\\s+");
      merges.add(new Merge(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]), Integer.parseInt(parts[3])));
    }
    return merges;
  }

  /** Aplica sempre o merge aprendido primeiro (menor id) entre os pares presentes. */
  static List<Integer> encode(List<Integer> ids, List<Merge> merges) {
    Map<Long, Integer> ranks = new HashMap<>();
    for (Merge m : merges) ranks.put(key(m.a(), m.b()), m.id());
    return encodeWithRanks(ids, ranks);
  }

  static List<Integer> encodeWithRanks(List<Integer> ids, Map<Long, Integer> ranks) {
    while (ids.size() >= 2) {
      int bestA = -1;
      int bestB = -1;
      int bestId = Integer.MAX_VALUE;
      for (int i = 0; i + 1 < ids.size(); i++) {
        Integer id = ranks.get(key(ids.get(i), ids.get(i + 1)));
        if (id != null && id < bestId) {
          bestId = id;
          bestA = ids.get(i);
          bestB = ids.get(i + 1);
        }
      }
      if (bestA < 0) break;
      ids = merge(ids, bestA, bestB, bestId);
    }
    return ids;
  }

  static byte[] decode(List<Integer> ids, List<Merge> merges) {
    Map<Integer, byte[]> vocab = new HashMap<>();
    for (int b = 0; b < 256; b++) vocab.put(b, new byte[] {(byte) b});
    for (Merge m : merges) vocab.put(m.id(), concat(vocab.get(m.a()), vocab.get(m.b())));
    byte[] out = new byte[0];
    for (int id : ids) out = concat(out, vocab.get(id));
    return out;
  }

  static byte[] concat(byte[] a, byte[] b) {
    byte[] out = new byte[a.length + b.length];
    System.arraycopy(a, 0, out, 0, a.length);
    System.arraycopy(b, 0, out, a.length, b.length);
    return out;
  }

  // ------------------------------------------------------- stages 7 e 8

  static List<String> split(String text) {
    List<String> chunks = new ArrayList<>();
    Matcher matcher = GPT2_SPLIT.matcher(text);
    while (matcher.find()) chunks.add(matcher.group());
    return chunks;
  }

  static String jsonString(String value) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : value.toCharArray()) {
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
    return out.append('"').toString();
  }

  /**
   * GPT-2 representa cada byte como um caractere "imprimível" (bytes_to_unicode).
   * Os IDs 0–255 seguem essa ordem; o merge de rank r gera o ID 256 + r.
   */
  static int[] byteOrder() {
    List<Integer> bs = new ArrayList<>();
    for (int b = '!'; b <= '~'; b++) bs.add(b);
    for (int b = 0xA1; b <= 0xAC; b++) bs.add(b);
    for (int b = 0xAE; b <= 0xFF; b++) bs.add(b);
    int[] unicodeOf = new int[256];
    int extra = 0;
    for (int b : bs) unicodeOf[b] = b;
    for (int b = 0; b < 256; b++) {
      if (!bs.contains(b)) {
        bs.add(b);
        unicodeOf[b] = 256 + extra++;
      }
    }
    int[] idOf = new int[256];
    for (int i = 0; i < 256; i++) idOf[bs.get(i)] = i;
    unicodeCache = unicodeOf;
    return idOf;
  }

  static int[] unicodeCache;

  static List<Integer> gpt2Encode(String text, Path vocabFile) throws IOException {
    int[] idOfByte = byteOrder();
    Map<String, Integer> tokenIds = new HashMap<>();
    for (int b = 0; b < 256; b++) tokenIds.put(Character.toString(unicodeCache[b]), idOfByte[b]);

    Map<Long, Integer> ranks = new HashMap<>();
    List<String> lines = Files.readAllLines(vocabFile, StandardCharsets.UTF_8);
    int rank = 0;
    for (String line : lines) {
      line = line.strip();
      if (line.isEmpty() || line.startsWith("#version")) continue;
      String[] parts = line.split(" ");
      int id = 256 + rank++;
      ranks.put(key(tokenIds.get(parts[0]), tokenIds.get(parts[1])), id);
      tokenIds.put(parts[0] + parts[1], id);
    }

    List<Integer> out = new ArrayList<>();
    for (String chunk : split(text)) {
      List<Integer> ids = new ArrayList<>();
      for (byte b : chunk.getBytes(StandardCharsets.UTF_8)) ids.add(idOfByte[b & 0xff]);
      out.addAll(encodeWithRanks(ids, ranks));
    }
    return out;
  }
}
