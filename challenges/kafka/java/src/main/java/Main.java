import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.TreeMap;
import java.util.UUID;

/**
 * Implementação de referência do desafio "Build your own Kafka" (25 stages).
 *
 * Broker com ApiVersions v0–4, DescribeTopicPartitions v0, Fetch v0–16 (respostas no
 * formato v16) e Produce v0–11 (formato v11). Os metadados vêm do log KRaft em
 * <log.dirs>/__cluster_metadata-0 e as mensagens ficam em <log.dirs>/<tópico>-<partição>.
 *
 * Uso: your_program.sh <server.properties>
 */
public class Main {
  static final short API_PRODUCE = 0;
  static final short API_FETCH = 1;
  static final short API_VERSIONS = 18;
  static final short API_DESCRIBE_TOPIC_PARTITIONS = 75;

  static final short NONE = 0;
  static final short UNKNOWN_TOPIC_OR_PARTITION = 3;
  static final short UNSUPPORTED_VERSION = 35;
  static final short UNKNOWN_TOPIC_ID = 100;

  static Path logDir;
  static final Metadata metadata = new Metadata();

  public static void main(String[] args) throws Exception {
    Properties props = new Properties();
    if (args.length > 0) {
      try (var reader = Files.newBufferedReader(Path.of(args[0]))) {
        props.load(reader);
      }
    }
    String listeners = props.getProperty("listeners", "PLAINTEXT://:9092");
    int port = Integer.parseInt(listeners.substring(listeners.lastIndexOf(':') + 1).trim());
    logDir = Path.of(props.getProperty("log.dirs", "/tmp/kraft-combined-logs").split(",")[0].trim());
    metadata.load(logDir.resolve("__cluster_metadata-0").resolve("00000000000000000000.log"));

    try (ServerSocket server = new ServerSocket(port, 50, InetAddress.getByName("127.0.0.1"))) {
      server.setReuseAddress(true);
      System.err.println("broker ouvindo em 127.0.0.1:" + port + " · log.dirs=" + logDir
          + " · " + metadata.topicsByName.size() + " tópico(s)");
      while (true) {
        Socket client = server.accept();
        Thread.ofVirtual().start(() -> serve(client));
      }
    }
  }

  static void serve(Socket socket) {
    try (socket) {
      DataInputStream in = new DataInputStream(socket.getInputStream());
      DataOutputStream out = new DataOutputStream(socket.getOutputStream());
      while (true) {
        int size;
        try {
          size = in.readInt();
        } catch (EOFException closed) {
          return;
        }
        byte[] request = in.readNBytes(size);
        byte[] response = handle(new Reader(request));
        out.writeInt(response.length);
        out.write(response);
        out.flush();
      }
    } catch (Exception error) {
      System.err.println("conexão encerrada: " + error);
    }
  }

  static byte[] handle(Reader r) throws IOException {
    short apiKey = r.int16();
    short apiVersion = r.int16();
    int correlationId = r.int32();
    r.nullableString(); // client_id
    r.taggedFields();

    Writer w = new Writer();
    w.int32(correlationId);
    switch (apiKey) {
      case API_VERSIONS -> apiVersions(w, apiVersion); // header v0, sempre
      case API_DESCRIBE_TOPIC_PARTITIONS -> {
        w.taggedFields();
        describeTopicPartitions(r, w);
      }
      case API_FETCH -> {
        w.taggedFields();
        fetch(r, w);
      }
      case API_PRODUCE -> {
        w.taggedFields();
        produce(r, w);
      }
      default -> System.err.println("api_key não suportada: " + apiKey);
    }
    return w.toBytes();
  }

  // --------------------------------------------------------- ApiVersions

  static void apiVersions(Writer w, short version) {
    w.int16(version < 0 || version > 4 ? UNSUPPORTED_VERSION : NONE);
    short[][] apis = {
        {API_PRODUCE, 0, 11},
        {API_FETCH, 0, 16},
        {API_VERSIONS, 0, 4},
        {API_DESCRIBE_TOPIC_PARTITIONS, 0, 0},
    };
    w.compactArrayLength(apis.length);
    for (short[] api : apis) {
      w.int16(api[0]);
      w.int16(api[1]);
      w.int16(api[2]);
      w.taggedFields();
    }
    w.int32(0); // throttle_time_ms
    w.taggedFields();
  }

  // ------------------------------------------- DescribeTopicPartitions v0

  static void describeTopicPartitions(Reader r, Writer w) {
    int count = r.compactArrayLength();
    List<String> names = new ArrayList<>();
    for (int i = 0; i < count; i++) {
      names.add(r.compactString());
      r.taggedFields();
    }
    r.int32(); // response_partition_limit
    names.sort(Comparator.naturalOrder());

    w.int32(0); // throttle_time_ms
    w.compactArrayLength(names.size());
    for (String name : names) {
      Topic topic = metadata.topicsByName.get(name);
      if (topic == null) {
        w.int16(UNKNOWN_TOPIC_OR_PARTITION);
        w.compactNullableString(name);
        w.uuid(new UUID(0, 0));
        w.bool(false);
        w.compactArrayLength(0);
      } else {
        w.int16(NONE);
        w.compactNullableString(name);
        w.uuid(topic.id);
        w.bool(false);
        w.compactArrayLength(topic.partitions.size());
        for (Partition p : topic.partitions.values()) {
          w.int16(NONE);
          w.int32(p.index);
          w.int32(p.leader);
          w.int32(p.leaderEpoch);
          w.int32Array(p.replicas);
          w.int32Array(p.isr);
          w.int32Array(new int[0]); // eligible_leader_replicas
          w.int32Array(new int[0]); // last_known_elr
          w.int32Array(new int[0]); // offline_replicas
          w.taggedFields();
        }
      }
      w.int32(0x00000df8); // topic_authorized_operations
      w.taggedFields();
    }
    w.int8((byte) -1); // next_cursor = null
    w.taggedFields();
  }

  // -------------------------------------------------------------- Fetch

  record FetchPartition(int index, long offset) {}

  static void fetch(Reader r, Writer w) throws IOException {
    r.int32(); // max_wait_ms
    r.int32(); // min_bytes
    r.int32(); // max_bytes
    r.int8(); // isolation_level
    int sessionId = r.int32();
    r.int32(); // session_epoch
    int topicCount = r.compactArrayLength();

    w.int32(0); // throttle_time_ms
    w.int16(NONE);
    w.int32(sessionId);
    w.compactArrayLength(topicCount);
    for (int t = 0; t < topicCount; t++) {
      UUID topicId = r.uuid();
      int partitionCount = r.compactArrayLength();
      List<FetchPartition> partitions = new ArrayList<>();
      for (int p = 0; p < partitionCount; p++) {
        int index = r.int32();
        r.int32(); // current_leader_epoch
        long fetchOffset = r.int64();
        r.int32(); // last_fetched_epoch
        r.int64(); // log_start_offset
        r.int32(); // partition_max_bytes
        r.taggedFields();
        partitions.add(new FetchPartition(index, fetchOffset));
      }
      r.taggedFields();

      Topic topic = metadata.topicsById.get(topicId);
      w.uuid(topicId);
      w.compactArrayLength(partitions.size());
      for (FetchPartition fp : partitions) {
        w.int32(fp.index());
        if (topic == null || !topic.partitions.containsKey(fp.index())) {
          w.int16(topic == null ? UNKNOWN_TOPIC_ID : UNKNOWN_TOPIC_OR_PARTITION);
          w.int64(-1);
          w.int64(-1);
          w.int64(-1);
          w.compactArrayLength(0); // aborted_transactions
          w.int32(-1); // preferred_read_replica
          w.compactBytes(null);
        } else {
          byte[] log = readPartitionLog(topic.name, fp.index());
          long highWatermark = nextOffset(log);
          w.int16(NONE);
          w.int64(highWatermark);
          w.int64(highWatermark);
          w.int64(0);
          w.compactArrayLength(0);
          w.int32(-1);
          w.compactBytes(batchesFrom(log, fp.offset()));
        }
        w.taggedFields();
      }
      w.taggedFields();
    }
    w.taggedFields();
  }

  /** Os record batches cujo último offset é ≥ fetchOffset. */
  static byte[] batchesFrom(byte[] log, long fetchOffset) {
    ByteBuffer buffer = ByteBuffer.wrap(log);
    while (buffer.remaining() >= 12) {
      int start = buffer.position();
      long baseOffset = buffer.getLong();
      int length = buffer.getInt();
      int lastOffsetDelta = buffer.getInt(start + 23);
      if (baseOffset + lastOffsetDelta >= fetchOffset) return Arrays.copyOfRange(log, start, log.length);
      buffer.position(start + 12 + length);
    }
    return new byte[0];
  }

  // ------------------------------------------------------------ Produce

  static void produce(Reader r, Writer w) throws IOException {
    r.compactNullableString(); // transactional_id
    r.int16(); // acks
    r.int32(); // timeout_ms
    int topicCount = r.compactArrayLength();
    w.compactArrayLength(topicCount);
    for (int t = 0; t < topicCount; t++) {
      String name = r.compactString();
      Topic topic = metadata.topicsByName.get(name);
      int partitionCount = r.compactArrayLength();
      w.compactString(name);
      w.compactArrayLength(partitionCount);
      for (int p = 0; p < partitionCount; p++) {
        int index = r.int32();
        byte[] records = r.compactBytes();
        r.taggedFields();
        w.int32(index);
        if (topic == null || !topic.partitions.containsKey(index)) {
          w.int16(UNKNOWN_TOPIC_OR_PARTITION);
          w.int64(-1);
          w.int64(-1);
          w.int64(-1);
        } else {
          long baseOffset = append(name, index, records == null ? new byte[0] : records);
          w.int16(NONE);
          w.int64(baseOffset);
          w.int64(-1); // log_append_time_ms
          w.int64(0); // log_start_offset
        }
        w.compactArrayLength(0); // record_errors
        w.compactNullableString(null); // error_message
        w.taggedFields();
      }
      r.taggedFields();
      w.taggedFields();
    }
    r.taggedFields();
    w.int32(0); // throttle_time_ms
    w.taggedFields();
  }

  static Path partitionLog(String topic, int partition) {
    return logDir.resolve(topic + "-" + partition).resolve("00000000000000000000.log");
  }

  static byte[] readPartitionLog(String topic, int partition) throws IOException {
    Path file = partitionLog(topic, partition);
    return Files.exists(file) ? Files.readAllBytes(file) : new byte[0];
  }

  static long nextOffset(byte[] log) {
    ByteBuffer buffer = ByteBuffer.wrap(log);
    long next = 0;
    while (buffer.remaining() >= 12) {
      int start = buffer.position();
      long baseOffset = buffer.getLong();
      int length = buffer.getInt();
      next = baseOffset + buffer.getInt(start + 23) + 1;
      buffer.position(start + 12 + length);
    }
    return next;
  }

  /** Grava os batches no fim do log, reescrevendo o baseOffset de cada um. Devolve o primeiro offset. */
  static synchronized long append(String topic, int partition, byte[] records) throws IOException {
    Path file = partitionLog(topic, partition);
    Files.createDirectories(file.getParent());
    long next = nextOffset(readPartitionLog(topic, partition));
    long first = next;
    ByteBuffer buffer = ByteBuffer.wrap(records);
    while (buffer.remaining() >= 12) {
      int start = buffer.position();
      int length = buffer.getInt(start + 8);
      buffer.putLong(start, next); // o CRC não cobre o baseOffset
      next += buffer.getInt(start + 23) + 1;
      buffer.position(start + 12 + length);
    }
    Files.write(file, records, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    return first;
  }

  // ------------------------------------------------- metadados (KRaft)

  static final class Partition {
    int index;
    int leader;
    int leaderEpoch;
    int[] replicas;
    int[] isr;
  }

  static final class Topic {
    String name;
    UUID id;
    final TreeMap<Integer, Partition> partitions = new TreeMap<>();
  }

  static final class Metadata {
    final Map<String, Topic> topicsByName = new HashMap<>();
    final Map<UUID, Topic> topicsById = new HashMap<>();

    void load(Path file) throws IOException {
      if (!Files.exists(file)) return;
      byte[] log = Files.readAllBytes(file);
      ByteBuffer buffer = ByteBuffer.wrap(log);
      List<Runnable> partitionRecords = new ArrayList<>();
      while (buffer.remaining() >= 12) {
        int start = buffer.position();
        int length = buffer.getInt(start + 8);
        int recordCount = buffer.getInt(start + 57);
        Reader records = new Reader(Arrays.copyOfRange(log, start + 61, start + 12 + length));
        for (int i = 0; i < recordCount; i++) {
          int recordLength = records.varint();
          Reader record = new Reader(records.bytes(recordLength));
          record.int8(); // attributes
          record.varlong(); // timestamp delta
          record.varint(); // offset delta
          int keyLength = record.varint();
          if (keyLength > 0) record.bytes(keyLength);
          int valueLength = record.varint();
          Reader value = new Reader(record.bytes(valueLength));
          readMetadataRecord(value, partitionRecords);
        }
        buffer.position(start + 12 + length);
      }
      partitionRecords.forEach(Runnable::run);
    }

    void readMetadataRecord(Reader value, List<Runnable> partitionRecords) {
      value.int8(); // frame version
      int type = value.int8();
      int version = value.int8();
      if (type == 2) { // TopicRecord
        Topic topic = new Topic();
        topic.name = value.compactString();
        topic.id = value.uuid();
        topicsByName.put(topic.name, topic);
        topicsById.put(topic.id, topic);
      } else if (type == 3) { // PartitionRecord
        Partition partition = new Partition();
        partition.index = value.int32();
        UUID topicId = value.uuid();
        partition.replicas = value.int32Array();
        partition.isr = value.int32Array();
        value.int32Array(); // removing_replicas
        value.int32Array(); // adding_replicas
        partition.leader = value.int32();
        partition.leaderEpoch = value.int32();
        partitionRecords.add(() -> {
          Topic topic = topicsById.get(topicId);
          if (topic != null) topic.partitions.put(partition.index, partition);
        });
      }
      // outros tipos (FeatureLevelRecord etc.) são ignorados
    }
  }

  // ------------------------------------------------- leitura e escrita

  static final class Reader {
    final ByteBuffer buffer;

    Reader(byte[] data) {
      buffer = ByteBuffer.wrap(data);
    }

    byte int8() { return buffer.get(); }
    short int16() { return buffer.getShort(); }
    int int32() { return buffer.getInt(); }
    long int64() { return buffer.getLong(); }

    byte[] bytes(int n) {
      byte[] out = new byte[n];
      buffer.get(out);
      return out;
    }

    UUID uuid() {
      return new UUID(buffer.getLong(), buffer.getLong());
    }

    int unsignedVarint() {
      int value = 0;
      int shift = 0;
      int b;
      do {
        b = buffer.get() & 0xff;
        value |= (b & 0x7f) << shift;
        shift += 7;
      } while ((b & 0x80) != 0);
      return value;
    }

    long unsignedVarlong() {
      long value = 0;
      int shift = 0;
      int b;
      do {
        b = buffer.get() & 0xff;
        value |= (long) (b & 0x7f) << shift;
        shift += 7;
      } while ((b & 0x80) != 0);
      return value;
    }

    int varint() {
      int raw = unsignedVarint();
      return (raw >>> 1) ^ -(raw & 1);
    }

    long varlong() {
      long raw = unsignedVarlong();
      return (raw >>> 1) ^ -(raw & 1);
    }

    String nullableString() {
      short length = int16();
      return length < 0 ? null : new String(bytes(length), StandardCharsets.UTF_8);
    }

    String compactString() {
      int length = unsignedVarint() - 1;
      return new String(bytes(length), StandardCharsets.UTF_8);
    }

    String compactNullableString() {
      int length = unsignedVarint() - 1;
      return length < 0 ? null : new String(bytes(length), StandardCharsets.UTF_8);
    }

    byte[] compactBytes() {
      int length = unsignedVarint() - 1;
      return length < 0 ? null : bytes(length);
    }

    int compactArrayLength() {
      return unsignedVarint() - 1;
    }

    int[] int32Array() {
      int n = compactArrayLength();
      int[] out = new int[Math.max(n, 0)];
      for (int i = 0; i < out.length; i++) out[i] = int32();
      return out;
    }

    void taggedFields() {
      int count = unsignedVarint();
      for (int i = 0; i < count; i++) {
        unsignedVarint(); // tag
        bytes(unsignedVarint());
      }
    }
  }

  static final class Writer {
    final ByteArrayOutputStream out = new ByteArrayOutputStream();

    void int8(byte v) { out.write(v); }
    void bool(boolean v) { out.write(v ? 1 : 0); }
    void int16(short v) { out.writeBytes(ByteBuffer.allocate(2).putShort(v).array()); }
    void int32(int v) { out.writeBytes(ByteBuffer.allocate(4).putInt(v).array()); }
    void int64(long v) { out.writeBytes(ByteBuffer.allocate(8).putLong(v).array()); }

    void uuid(UUID id) {
      int64(id.getMostSignificantBits());
      int64(id.getLeastSignificantBits());
    }

    void unsignedVarint(int value) {
      while ((value & ~0x7f) != 0) {
        out.write((value & 0x7f) | 0x80);
        value >>>= 7;
      }
      out.write(value);
    }

    void compactArrayLength(int n) { unsignedVarint(n + 1); }

    void compactString(String s) {
      byte[] bytes = s.getBytes(StandardCharsets.UTF_8);
      unsignedVarint(bytes.length + 1);
      out.writeBytes(bytes);
    }

    void compactNullableString(String s) {
      if (s == null) unsignedVarint(0);
      else compactString(s);
    }

    void compactBytes(byte[] bytes) {
      if (bytes == null) {
        unsignedVarint(0);
        return;
      }
      unsignedVarint(bytes.length + 1);
      out.writeBytes(bytes);
    }

    void int32Array(int[] values) {
      compactArrayLength(values.length);
      for (int v : values) int32(v);
    }

    void taggedFields() { unsignedVarint(0); }

    byte[] toBytes() { return out.toByteArray(); }
  }
}
