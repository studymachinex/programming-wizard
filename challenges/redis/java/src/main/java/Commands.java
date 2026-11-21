import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** A implementação de cada comando. Roda sempre com o lock do servidor. */
final class Commands {
  static final class CommandError extends Exception {
    CommandError(String message) {
      super(message);
    }
  }

  static final Set<String> KNOWN = Set.of(
      "PING", "ECHO", "SET", "GET", "DEL", "KEYS", "TYPE", "INCR",
      "RPUSH", "LPUSH", "LRANGE", "LLEN", "LPOP", "BLPOP",
      "XADD", "XRANGE", "XREAD",
      "MULTI", "EXEC", "DISCARD", "WATCH", "UNWATCH",
      "INFO", "REPLCONF", "PSYNC", "WAIT", "CONFIG",
      "SUBSCRIBE", "UNSUBSCRIBE", "PUBLISH",
      "ZADD", "ZRANK", "ZRANGE", "ZCARD", "ZSCORE", "ZREM",
      "SETBIT", "GETBIT", "BITCOUNT", "BITOP",
      "GEOADD", "GEOPOS", "GEODIST", "GEOSEARCH",
      "ACL", "AUTH");

  private static final String WRONG_TYPE = "WRONGTYPE Operation against a key holding the wrong kind of value";

  private Commands() {}

  static byte[] run(Server server, Server.Session session, String name, List<String> args)
      throws CommandError, InterruptedException {
    Store store = server.store;
    return switch (name) {
      case "PING" -> session.subscriptions.isEmpty()
          ? Resp.simple("PONG")
          : Resp.array(Resp.bulk("pong"), Resp.bulk(""));
      case "ECHO" -> Resp.bulk(arg(args, 0, name));
      case "SET" -> set(store, args);
      case "GET" -> {
        Object value = store.get(arg(args, 0, name));
        if (value == null) yield Resp.nullBulk();
        yield Resp.bulk(string(value).data);
      }
      case "DEL" -> {
        int deleted = 0;
        for (String key : args) if (store.delete(key)) deleted++;
        yield Resp.integer(deleted);
      }
      case "KEYS" -> Resp.bulkArray(store.keys(arg(args, 0, name)));
      case "TYPE" -> Resp.simple(store.type(arg(args, 0, name)));
      case "INCR" -> incr(store, arg(args, 0, name));

      case "RPUSH", "LPUSH" -> push(server, name, args);
      case "LRANGE" -> {
        Store.ListValue list = list(store.get(arg(args, 0, name)));
        List<String> items = list == null ? List.of() : new ArrayList<>(list.items);
        yield Resp.bulkArray(slice(items, parseLong(arg(args, 1, name)), parseLong(arg(args, 2, name))));
      }
      case "LLEN" -> {
        Store.ListValue list = list(store.get(arg(args, 0, name)));
        yield Resp.integer(list == null ? 0 : list.items.size());
      }
      case "LPOP" -> lpop(store, args);
      case "BLPOP" -> blpop(server, args);

      case "XADD" -> xadd(server, args);
      case "XRANGE" -> xrange(store, args);
      case "XREAD" -> xread(server, args);

      case "INFO" -> server.info(args.isEmpty() ? "replication" : args.get(0));
      case "REPLCONF" -> replconf(server, session, args);
      case "PSYNC" -> psync(server, session);
      case "WAIT" -> server.waitReplicas(Integer.parseInt(arg(args, 0, name)), Long.parseLong(arg(args, 1, name)));
      case "CONFIG" -> {
        if (!arg(args, 0, name).equalsIgnoreCase("GET")) throw new CommandError("ERR only CONFIG GET is supported");
        List<String> reply = new ArrayList<>();
        for (String param : args.subList(1, args.size())) {
          String value = server.config.get(param);
          if (value != null) {
            reply.add(param);
            reply.add(value);
          }
        }
        yield Resp.bulkArray(reply);
      }

      case "SUBSCRIBE" -> server.subscribe(session, args);
      case "UNSUBSCRIBE" -> server.unsubscribe(session, args);
      case "PUBLISH" -> Resp.integer(server.publish(arg(args, 0, name), arg(args, 1, name)));

      case "ZADD" -> {
        if (args.size() < 3 || args.size() % 2 == 0) throw arity(name);
        Store.SortedSet zset = zsetOrCreate(store, args.get(0));
        int added = 0;
        for (int i = 1; i < args.size(); i += 2) if (zset.add(args.get(i + 1), parseDouble(args.get(i)))) added++;
        store.touch(args.get(0));
        yield Resp.integer(added);
      }
      case "ZRANK" -> {
        Store.SortedSet zset = zset(store.get(arg(args, 0, name)));
        int rank = zset == null ? -1 : zset.rank(arg(args, 1, name));
        yield rank < 0 ? Resp.nullBulk() : Resp.integer(rank);
      }
      case "ZRANGE" -> {
        Store.SortedSet zset = zset(store.get(arg(args, 0, name)));
        List<String> members = new ArrayList<>();
        if (zset != null) for (Store.Member member : zset.ordered) members.add(member.name());
        yield Resp.bulkArray(slice(members, parseLong(arg(args, 1, name)), parseLong(arg(args, 2, name))));
      }
      case "ZCARD" -> {
        Store.SortedSet zset = zset(store.get(arg(args, 0, name)));
        yield Resp.integer(zset == null ? 0 : zset.scores.size());
      }
      case "ZSCORE" -> {
        Store.SortedSet zset = zset(store.get(arg(args, 0, name)));
        Double score = zset == null ? null : zset.scores.get(arg(args, 1, name));
        yield score == null ? Resp.nullBulk() : Resp.bulk(Server.formatDouble(score));
      }
      case "ZREM" -> {
        Store.SortedSet zset = zset(store.get(arg(args, 0, name)));
        int removed = 0;
        if (zset != null) for (String member : args.subList(1, args.size())) if (zset.remove(member)) removed++;
        if (removed > 0) store.touch(args.get(0));
        yield Resp.integer(removed);
      }

      case "SETBIT" -> setbit(store, args);
      case "GETBIT" -> {
        Object value = store.get(arg(args, 0, name));
        String data = value == null ? "" : string(value).data;
        long offset = parseLong(arg(args, 1, name));
        int index = (int) (offset / 8);
        if (index >= data.length()) yield Resp.integer(0);
        yield Resp.integer((data.charAt(index) >> (7 - (int) (offset % 8))) & 1);
      }
      case "BITCOUNT" -> bitcount(store, args);
      case "BITOP" -> bitop(store, args);

      case "GEOADD" -> geoadd(store, args);
      case "GEOPOS" -> {
        Store.SortedSet zset = zset(store.get(arg(args, 0, name)));
        List<byte[]> items = new ArrayList<>();
        for (String member : args.subList(1, args.size())) {
          Double score = zset == null ? null : zset.scores.get(member);
          if (score == null) {
            items.add(Resp.nullArray());
          } else {
            double[] coords = Geo.decode(score.longValue());
            items.add(Resp.array(Resp.bulk(String.valueOf(coords[0])), Resp.bulk(String.valueOf(coords[1]))));
          }
        }
        yield Resp.array(items);
      }
      case "GEODIST" -> {
        Store.SortedSet zset = zset(store.get(arg(args, 0, name)));
        Double a = zset == null ? null : zset.scores.get(arg(args, 1, name));
        Double b = zset == null ? null : zset.scores.get(arg(args, 2, name));
        if (a == null || b == null) yield Resp.nullBulk();
        double[] p = Geo.decode(a.longValue());
        double[] q = Geo.decode(b.longValue());
        double meters = Geo.distance(p[0], p[1], q[0], q[1]);
        String unit = args.size() > 3 ? args.get(3) : "m";
        yield Resp.bulk(String.format(Locale.ROOT, "%.4f", meters / Geo.toMeters(1, unit)));
      }
      case "GEOSEARCH" -> geosearch(store, args);

      case "ACL" -> acl(server, session, args);
      case "AUTH" -> auth(server, session, args);
      default -> throw new CommandError("ERR unknown command '" + name.toLowerCase(Locale.ROOT) + "'");
    };
  }

  // ---------------------------------------------------------------- strings

  private static byte[] set(Store store, List<String> args) throws CommandError {
    if (args.size() < 2) throw arity("SET");
    String key = args.get(0);
    Store.Str value = new Store.Str(args.get(1));
    long expiresAt = -1;
    for (int i = 2; i + 1 < args.size(); i += 2) {
      long amount = parseLong(args.get(i + 1));
      switch (args.get(i).toUpperCase(Locale.ROOT)) {
        case "PX" -> expiresAt = System.currentTimeMillis() + amount;
        case "EX" -> expiresAt = System.currentTimeMillis() + amount * 1000;
        default -> throw new CommandError("ERR syntax error");
      }
    }
    if (expiresAt >= 0) store.putWithExpiry(key, value, expiresAt);
    else store.put(key, value);
    return Resp.simple("OK");
  }

  private static byte[] incr(Store store, String key) throws CommandError {
    Object current = store.get(key);
    long value = 0;
    if (current != null) {
      try {
        value = Long.parseLong(string(current).data);
      } catch (NumberFormatException e) {
        throw new CommandError("ERR value is not an integer or out of range");
      }
    }
    value++;
    if (current != null) {
      ((Store.Str) current).data = String.valueOf(value);
      store.touch(key);
    } else {
      store.put(key, new Store.Str(String.valueOf(value)));
    }
    return Resp.integer(value);
  }

  // ------------------------------------------------------------------ listas

  private static byte[] push(Server server, String name, List<String> args) throws CommandError {
    if (args.size() < 2) throw arity(name);
    Store store = server.store;
    Object current = store.get(args.get(0));
    Store.ListValue list = list(current);
    if (list == null) {
      list = new Store.ListValue();
      store.put(args.get(0), list);
    }
    for (String item : args.subList(1, args.size())) {
      if (name.equals("RPUSH")) list.items.addLast(item);
      else list.items.addFirst(item);
    }
    store.touch(args.get(0));
    int size = list.items.size();
    server.lock.notifyAll();
    return Resp.integer(size);
  }

  private static byte[] lpop(Store store, List<String> args) throws CommandError {
    String key = arg(args, 0, "LPOP");
    Store.ListValue list = list(store.get(key));
    if (args.size() < 2) {
      if (list == null || list.items.isEmpty()) return Resp.nullBulk();
      String item = list.items.pollFirst();
      afterPop(store, key, list);
      return Resp.bulk(item);
    }
    if (list == null || list.items.isEmpty()) return Resp.nullArray();
    long count = parseLong(args.get(1));
    List<String> popped = new ArrayList<>();
    while (popped.size() < count && !list.items.isEmpty()) popped.add(list.items.pollFirst());
    afterPop(store, key, list);
    return Resp.bulkArray(popped);
  }

  private static void afterPop(Store store, String key, Store.ListValue list) {
    if (list.items.isEmpty()) store.delete(key);
    else store.touch(key);
  }

  /** BLPOP: espera em fila, por ordem de chegada, até a lista ter um elemento ou o tempo acabar. */
  private static byte[] blpop(Server server, List<String> args) throws CommandError, InterruptedException {
    if (args.size() < 2) throw arity("BLPOP");
    List<String> keys = args.subList(0, args.size() - 1);
    double timeout = parseDouble(args.get(args.size() - 1));
    long deadline = timeout == 0 ? Long.MAX_VALUE : System.currentTimeMillis() + (long) (timeout * 1000);
    Object ticket = new Object();
    for (String key : keys) server.listWaiters.computeIfAbsent(key, k -> new ArrayDeque<>()).addLast(ticket);
    try {
      while (true) {
        for (String key : keys) {
          ArrayDeque<Object> queue = server.listWaiters.get(key);
          Store.ListValue list = list(server.store.get(key));
          if (queue.peekFirst() == ticket && list != null && !list.items.isEmpty()) {
            String item = list.items.pollFirst();
            afterPop(server.store, key, list);
            return Resp.bulkArray(List.of(key, item));
          }
        }
        long remaining = deadline - System.currentTimeMillis();
        if (remaining <= 0) return Resp.nullArray();
        server.lock.wait(Math.min(remaining, 1000));
      }
    } finally {
      for (String key : keys) {
        ArrayDeque<Object> queue = server.listWaiters.get(key);
        queue.remove(ticket);
        if (queue.isEmpty()) server.listWaiters.remove(key);
      }
      server.lock.notifyAll();
    }
  }

  static List<String> slice(List<String> items, long start, long stop) {
    int size = items.size();
    if (start < 0) start = Math.max(0, size + start);
    if (stop < 0) stop = size + stop;
    if (stop >= size) stop = size - 1;
    if (start > stop || start >= size) return List.of();
    return items.subList((int) start, (int) stop + 1);
  }

  // ----------------------------------------------------------------- streams

  private static byte[] xadd(Server server, List<String> args) throws CommandError {
    if (args.size() < 4 || args.size() % 2 != 0) throw arity("XADD");
    Store store = server.store;
    String key = args.get(0);
    Object current = store.get(key);
    if (current != null && !(current instanceof Store.StreamValue)) throw new CommandError(WRONG_TYPE);
    Store.StreamValue stream = current == null ? new Store.StreamValue() : (Store.StreamValue) current;
    Store.StreamId id = newId(args.get(1), stream.last);
    if (id.equals(Store.StreamId.ZERO)) throw new CommandError("ERR The ID specified in XADD must be greater than 0-0");
    if (id.compareTo(stream.last) <= 0) {
      throw new CommandError("ERR The ID specified in XADD is equal or smaller than the target stream top item");
    }
    stream.entries.add(new Store.StreamEntry(id, new ArrayList<>(args.subList(2, args.size()))));
    stream.last = id;
    if (current == null) store.put(key, stream);
    else store.touch(key);
    server.lock.notifyAll();
    return Resp.bulk(id.toString());
  }

  private static Store.StreamId newId(String text, Store.StreamId last) throws CommandError {
    if (text.equals("*")) {
      long now = System.currentTimeMillis();
      if (now <= last.ms()) return new Store.StreamId(last.ms(), last.seq() + 1);
      return new Store.StreamId(now, 0);
    }
    int dash = text.indexOf('-');
    if (dash < 0) return new Store.StreamId(parseLong(text), 0);
    long ms = parseLong(text.substring(0, dash));
    String seq = text.substring(dash + 1);
    if (seq.equals("*")) {
      if (ms == last.ms()) return new Store.StreamId(ms, last.seq() + 1);
      return new Store.StreamId(ms, ms == 0 ? 1 : 0);
    }
    return new Store.StreamId(ms, parseLong(seq));
  }

  private static Store.StreamId parseBound(String text, boolean start) throws CommandError {
    if (text.equals("-")) return Store.StreamId.ZERO;
    if (text.equals("+")) return Store.StreamId.MAX;
    int dash = text.indexOf('-');
    if (dash < 0) return new Store.StreamId(parseLong(text), start ? 0 : Long.MAX_VALUE);
    return new Store.StreamId(parseLong(text.substring(0, dash)), parseLong(text.substring(dash + 1)));
  }

  private static byte[] entries(List<Store.StreamEntry> entries) {
    List<byte[]> items = new ArrayList<>();
    for (Store.StreamEntry entry : entries) {
      items.add(Resp.array(Resp.bulk(entry.id().toString()), Resp.bulkArray(entry.fields())));
    }
    return Resp.array(items);
  }

  private static byte[] xrange(Store store, List<String> args) throws CommandError {
    if (args.size() < 3) throw arity("XRANGE");
    Store.StreamValue stream = stream(store.get(args.get(0)));
    Store.StreamId start = parseBound(args.get(1), true);
    Store.StreamId end = parseBound(args.get(2), false);
    List<Store.StreamEntry> result = new ArrayList<>();
    if (stream != null) {
      for (Store.StreamEntry entry : stream.entries) {
        if (entry.id().compareTo(start) >= 0 && entry.id().compareTo(end) <= 0) result.add(entry);
      }
    }
    return entries(result);
  }

  private static byte[] xread(Server server, List<String> args) throws CommandError, InterruptedException {
    Long block = null;
    int i = 0;
    while (i < args.size() && !args.get(i).equalsIgnoreCase("STREAMS")) {
      if (args.get(i).equalsIgnoreCase("BLOCK")) block = parseLong(args.get(++i));
      i++;
    }
    List<String> rest = args.subList(Math.min(i + 1, args.size()), args.size());
    if (rest.isEmpty() || rest.size() % 2 != 0) throw arity("XREAD");
    int half = rest.size() / 2;
    List<String> keys = rest.subList(0, half);
    List<Store.StreamId> after = new ArrayList<>();
    for (int k = 0; k < half; k++) {
      String id = rest.get(half + k);
      if (id.equals("$")) {
        Store.StreamValue stream = stream(server.store.get(keys.get(k)));
        after.add(stream == null ? Store.StreamId.ZERO : stream.last);
      } else {
        after.add(parseBound(id, true));
      }
    }
    long deadline = block == null || block == 0 ? Long.MAX_VALUE : System.currentTimeMillis() + block;
    while (true) {
      List<byte[]> result = new ArrayList<>();
      for (int k = 0; k < half; k++) {
        Store.StreamValue stream = stream(server.store.get(keys.get(k)));
        if (stream == null) continue;
        List<Store.StreamEntry> found = new ArrayList<>();
        for (Store.StreamEntry entry : stream.entries) if (entry.id().compareTo(after.get(k)) > 0) found.add(entry);
        if (!found.isEmpty()) result.add(Resp.array(Resp.bulk(keys.get(k)), entries(found)));
      }
      if (!result.isEmpty()) return Resp.array(result);
      if (block == null) return Resp.nullArray();
      long remaining = deadline - System.currentTimeMillis();
      if (remaining <= 0) return Resp.nullArray();
      server.lock.wait(Math.min(remaining, 1000));
    }
  }

  // ------------------------------------------------------------- replicação

  private static byte[] replconf(Server server, Server.Session session, List<String> args) {
    if (!args.isEmpty() && args.get(0).equalsIgnoreCase("ACK")) {
      session.ackOffset = Long.parseLong(args.get(1));
      server.lock.notifyAll();
      return null; // ACK não tem resposta
    }
    return Resp.simple("OK");
  }

  private static byte[] psync(Server server, Server.Session session) {
    byte[] rdb = Rdb.empty();
    session.send(Resp.simple("FULLRESYNC " + server.replId + " " + server.masterOffset));
    byte[] header = ("$" + rdb.length + "\r\n").getBytes(Resp.BYTES);
    byte[] payload = new byte[header.length + rdb.length];
    System.arraycopy(header, 0, payload, 0, header.length);
    System.arraycopy(rdb, 0, payload, header.length, rdb.length);
    session.send(payload);
    session.isReplicaLink = true;
    server.replicas.add(session);
    return null;
  }

  // ----------------------------------------------------------------- bitmaps

  private static byte[] setbit(Store store, List<String> args) throws CommandError {
    if (args.size() < 3) throw arity("SETBIT");
    String key = args.get(0);
    long offset = parseLong(args.get(1));
    String bitText = args.get(2);
    if (!bitText.equals("0") && !bitText.equals("1")) throw new CommandError("ERR bit is not an integer or out of range");
    Object current = store.get(key);
    StringBuilder data = new StringBuilder(current == null ? "" : string(current).data);
    int index = (int) (offset / 8);
    while (data.length() <= index) data.append('\0');
    int shift = 7 - (int) (offset % 8);
    int oldByte = data.charAt(index);
    int previous = (oldByte >> shift) & 1;
    int newByte = bitText.equals("1") ? oldByte | (1 << shift) : oldByte & ~(1 << shift);
    data.setCharAt(index, (char) (newByte & 0xFF));
    if (current == null) store.put(key, new Store.Str(data.toString()));
    else {
      ((Store.Str) current).data = data.toString();
      store.touch(key);
    }
    return Resp.integer(previous);
  }

  private static byte[] bitcount(Store store, List<String> args) throws CommandError {
    Object value = store.get(arg(args, 0, "BITCOUNT"));
    String data = value == null ? "" : string(value).data;
    int start = 0;
    int end = data.length() - 1;
    if (args.size() >= 3) {
      long s = parseLong(args.get(1));
      long e = parseLong(args.get(2));
      if (s < 0) s = Math.max(0, data.length() + s);
      if (e < 0) e = data.length() + e;
      if (e >= data.length()) e = data.length() - 1;
      start = (int) s;
      end = (int) e;
    }
    long count = 0;
    for (int i = start; i <= end && i < data.length(); i++) count += Integer.bitCount(data.charAt(i));
    return Resp.integer(count);
  }

  private static byte[] bitop(Store store, List<String> args) throws CommandError {
    if (args.size() < 3) throw arity("BITOP");
    String op = args.get(0).toUpperCase(Locale.ROOT);
    String dest = args.get(1);
    List<String> sources = new ArrayList<>();
    int length = 0;
    for (String key : args.subList(2, args.size())) {
      Object value = store.get(key);
      String data = value == null ? "" : string(value).data;
      sources.add(data);
      length = Math.max(length, data.length());
    }
    StringBuilder result = new StringBuilder();
    for (int i = 0; i < length; i++) {
      int acc = byteAt(sources.get(0), i);
      if (op.equals("NOT")) acc = ~acc;
      for (String source : sources.subList(1, sources.size())) {
        int b = byteAt(source, i);
        acc = switch (op) {
          case "AND" -> acc & b;
          case "OR" -> acc | b;
          case "XOR" -> acc ^ b;
          default -> throw new CommandError("ERR syntax error");
        };
      }
      result.append((char) (acc & 0xFF));
    }
    if (length == 0) store.delete(dest);
    else store.put(dest, new Store.Str(result.toString()));
    return Resp.integer(length);
  }

  private static int byteAt(String data, int index) {
    return index < data.length() ? data.charAt(index) : 0;
  }

  // --------------------------------------------------------------------- geo

  private static byte[] geoadd(Store store, List<String> args) throws CommandError {
    if (args.size() < 4 || (args.size() - 1) % 3 != 0) throw arity("GEOADD");
    for (int i = 1; i < args.size(); i += 3) {
      double lon = parseDouble(args.get(i));
      double lat = parseDouble(args.get(i + 1));
      if (!Geo.valid(lon, lat)) {
        throw new CommandError(String.format(Locale.ROOT, "ERR invalid longitude,latitude pair %f,%f", lon, lat));
      }
    }
    Store.SortedSet zset = zsetOrCreate(store, args.get(0));
    int added = 0;
    for (int i = 1; i < args.size(); i += 3) {
      long score = Geo.encode(parseDouble(args.get(i)), parseDouble(args.get(i + 1)));
      if (zset.add(args.get(i + 2), score)) added++;
    }
    store.touch(args.get(0));
    return Resp.integer(added);
  }

  /** GEOSEARCH chave FROMLONLAT lon lat BYRADIUS raio unidade */
  private static byte[] geosearch(Store store, List<String> args) throws CommandError {
    if (args.size() < 7) throw arity("GEOSEARCH");
    Store.SortedSet zset = zset(store.get(args.get(0)));
    double lon = 0;
    double lat = 0;
    double radius = 0;
    for (int i = 1; i < args.size(); i++) {
      String option = args.get(i).toUpperCase(Locale.ROOT);
      if (option.equals("FROMLONLAT")) {
        lon = parseDouble(args.get(++i));
        lat = parseDouble(args.get(++i));
      } else if (option.equals("BYRADIUS")) {
        radius = parseDouble(args.get(++i));
        radius = Geo.toMeters(radius, args.get(++i));
      }
    }
    List<String> found = new ArrayList<>();
    if (zset != null) {
      for (Store.Member member : zset.ordered) {
        double[] coords = Geo.decode((long) member.score());
        if (Geo.distance(lon, lat, coords[0], coords[1]) <= radius) found.add(member.name());
      }
    }
    return Resp.bulkArray(found);
  }

  // --------------------------------------------------------------------- ACL

  private static byte[] acl(Server server, Server.Session session, List<String> args) throws CommandError {
    String sub = arg(args, 0, "ACL").toUpperCase(Locale.ROOT);
    switch (sub) {
      case "WHOAMI":
        return Resp.bulk(session.user);
      case "GETUSER": {
        Set<String> passwords = server.userPasswords.get(arg(args, 1, "ACL"));
        if (passwords == null) return Resp.nullArray();
        List<String> flags = passwords.isEmpty() ? List.of("nopass") : List.of();
        return Resp.array(Resp.bulk("flags"), Resp.bulkArray(flags), Resp.bulk("passwords"), Resp.bulkArray(new ArrayList<>(passwords)));
      }
      case "SETUSER": {
        Set<String> passwords = server.userPasswords.computeIfAbsent(arg(args, 1, "ACL"), u -> new java.util.LinkedHashSet<>());
        for (String rule : args.subList(2, args.size())) {
          if (rule.startsWith(">")) passwords.add(Server.sha256(rule.substring(1)));
          else if (rule.equals("nopass")) passwords.clear();
        }
        return Resp.simple("OK");
      }
      default:
        throw new CommandError("ERR unknown subcommand '" + args.get(0) + "'");
    }
  }

  private static byte[] auth(Server server, Server.Session session, List<String> args) throws CommandError {
    if (args.isEmpty()) throw arity("AUTH");
    String user = args.size() >= 2 ? args.get(0) : "default";
    String password = args.get(args.size() - 1);
    Set<String> passwords = server.userPasswords.get(user);
    if (passwords == null || (!passwords.isEmpty() && !passwords.contains(Server.sha256(password)))) {
      throw new CommandError("WRONGPASS invalid username-password pair or user is disabled.");
    }
    session.authenticated = true;
    session.user = user;
    return Resp.simple("OK");
  }

  // ------------------------------------------------------------------- apoio

  private static String arg(List<String> args, int index, String command) throws CommandError {
    if (index >= args.size()) throw arity(command);
    return args.get(index);
  }

  private static CommandError arity(String command) {
    return new CommandError("ERR wrong number of arguments for '" + command.toLowerCase(Locale.ROOT) + "' command");
  }

  private static long parseLong(String text) throws CommandError {
    try {
      return Long.parseLong(text);
    } catch (NumberFormatException e) {
      throw new CommandError("ERR value is not an integer or out of range");
    }
  }

  private static double parseDouble(String text) throws CommandError {
    try {
      return Double.parseDouble(text);
    } catch (NumberFormatException e) {
      throw new CommandError("ERR value is not a valid float");
    }
  }

  private static Store.Str string(Object value) throws CommandError {
    if (value instanceof Store.Str str) return str;
    throw new CommandError(WRONG_TYPE);
  }

  private static Store.ListValue list(Object value) throws CommandError {
    if (value == null || value instanceof Store.ListValue) return (Store.ListValue) value;
    throw new CommandError(WRONG_TYPE);
  }

  private static Store.StreamValue stream(Object value) throws CommandError {
    if (value == null || value instanceof Store.StreamValue) return (Store.StreamValue) value;
    throw new CommandError(WRONG_TYPE);
  }

  private static Store.SortedSet zset(Object value) throws CommandError {
    if (value == null || value instanceof Store.SortedSet) return (Store.SortedSet) value;
    throw new CommandError(WRONG_TYPE);
  }

  private static Store.SortedSet zsetOrCreate(Store store, String key) throws CommandError {
    Store.SortedSet zset = zset(store.get(key));
    if (zset == null) {
      zset = new Store.SortedSet();
      store.put(key, zset);
    }
    return zset;
  }
}
