import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * O keyspace: chave → valor tipado, expiração e um número de versão por chave (usado pelo
 * WATCH). Todos os métodos supõem que o chamador segura o lock global do servidor.
 */
final class Store {
  static final class Str {
    String data;

    Str(String data) {
      this.data = data;
    }
  }

  static final class ListValue {
    final ArrayDeque<String> items = new ArrayDeque<>();
  }

  record StreamId(long ms, long seq) implements Comparable<StreamId> {
    static final StreamId ZERO = new StreamId(0, 0);
    static final StreamId MAX = new StreamId(Long.MAX_VALUE, Long.MAX_VALUE);

    @Override
    public int compareTo(StreamId other) {
      int byMs = Long.compareUnsigned(ms, other.ms);
      return byMs != 0 ? byMs : Long.compareUnsigned(seq, other.seq);
    }

    @Override
    public String toString() {
      return ms + "-" + seq;
    }
  }

  record StreamEntry(StreamId id, List<String> fields) {}

  static final class StreamValue {
    final List<StreamEntry> entries = new ArrayList<>();
    StreamId last = StreamId.ZERO;
  }

  record Member(double score, String name) {}

  static final Comparator<Member> ZSET_ORDER =
      Comparator.comparingDouble(Member::score).thenComparing(Member::name);

  static final class SortedSet {
    final Map<String, Double> scores = new HashMap<>();
    final TreeSet<Member> ordered = new TreeSet<>(ZSET_ORDER);

    /** Devolve true se o membro é novo. */
    boolean add(String name, double score) {
      Double old = scores.put(name, score);
      if (old != null) ordered.remove(new Member(old, name));
      ordered.add(new Member(score, name));
      return old == null;
    }

    boolean remove(String name) {
      Double old = scores.remove(name);
      if (old == null) return false;
      ordered.remove(new Member(old, name));
      return true;
    }

    int rank(String name) {
      Double score = scores.get(name);
      if (score == null) return -1;
      return ordered.headSet(new Member(score, name)).size();
    }
  }

  private final Map<String, Object> data = new HashMap<>();
  private final Map<String, Long> expiresAt = new HashMap<>();
  private final Map<String, Long> versions = new HashMap<>();
  private long versionCounter = 0;

  Object get(String key) {
    Long expiry = expiresAt.get(key);
    if (expiry != null && System.currentTimeMillis() >= expiry) {
      data.remove(key);
      expiresAt.remove(key);
      touch(key);
    }
    return data.get(key);
  }

  void put(String key, Object value) {
    data.put(key, value);
    expiresAt.remove(key);
    touch(key);
  }

  void putWithExpiry(String key, Object value, long expiresAtMs) {
    data.put(key, value);
    expiresAt.put(key, expiresAtMs);
    touch(key);
  }

  boolean delete(String key) {
    boolean existed = get(key) != null;
    data.remove(key);
    expiresAt.remove(key);
    if (existed) touch(key);
    return existed;
  }

  /** Marca a chave como modificada (para o WATCH). */
  void touch(String key) {
    versions.put(key, ++versionCounter);
  }

  long version(String key) {
    get(key); // aplica expiração pendente
    return versions.getOrDefault(key, 0L);
  }

  List<String> keys(String pattern) {
    List<String> result = new ArrayList<>();
    for (String key : new ArrayList<>(data.keySet())) {
      if (get(key) != null && glob(pattern, key)) result.add(key);
    }
    result.sort(null);
    return result;
  }

  String type(String key) {
    Object value = get(key);
    if (value == null) return "none";
    if (value instanceof Str) return "string";
    if (value instanceof ListValue) return "list";
    if (value instanceof StreamValue) return "stream";
    return "zset";
  }

  /** Glob simples: *, ? e texto literal. */
  static boolean glob(String pattern, String text) {
    return glob(pattern, 0, text, 0);
  }

  private static boolean glob(String p, int pi, String t, int ti) {
    while (pi < p.length()) {
      char c = p.charAt(pi);
      if (c == '*') {
        for (int k = ti; k <= t.length(); k++) if (glob(p, pi + 1, t, k)) return true;
        return false;
      }
      if (ti >= t.length() || (c != '?' && c != t.charAt(ti))) return false;
      pi++;
      ti++;
    }
    return ti == t.length();
  }
}
