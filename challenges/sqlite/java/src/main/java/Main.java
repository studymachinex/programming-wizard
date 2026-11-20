import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Implementação de referência do desafio "Build your own SQLite" (9 stages).
 *
 * Lê o arquivo .db diretamente: header, páginas de B-tree, registros e índices.
 * Uso: your_program.sh <banco.db> (.dbinfo | .tables | "SELECT ...")
 */
public class Main {
  static final PrintStream OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);

  static final Pattern SELECT = Pattern.compile(
      "^\\s*select\\s+(.+?)\\s+from\\s+(\\w+)(?:\\s+where\\s+(\\w+)\\s*=\\s*'([^']*)')?\\s*;?\\s*$",
      Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

  public static void main(String[] args) throws IOException {
    if (args.length < 2) {
      System.err.println("uso: your_program.sh <banco.db> <comando>");
      System.exit(1);
    }
    try (Database db = new Database(args[0])) {
      String command = args[1];
      switch (command) {
        case ".dbinfo" -> {
          OUT.println("database page size: " + db.pageSize);
          long tables = db.schema().stream().filter(entry -> entry.type().equals("table")).count();
          OUT.println("number of tables: " + tables);
        }
        case ".tables" -> {
          List<String> names = new ArrayList<>();
          for (SchemaEntry entry : db.schema()) {
            if (entry.type().equals("table") && !entry.name().startsWith("sqlite_")) names.add(entry.name());
          }
          OUT.println(String.join(" ", names));
        }
        default -> query(db, command);
      }
    }
    OUT.flush();
  }

  // ---------------------------------------------------------------- SQL

  static void query(Database db, String sql) throws IOException {
    Matcher matcher = SELECT.matcher(sql);
    if (!matcher.matches()) throw new IllegalArgumentException("SQL não suportado: " + sql);
    String columnsPart = matcher.group(1).trim();
    String tableName = matcher.group(2);
    String whereColumn = matcher.group(3);
    String whereValue = matcher.group(4);

    SchemaEntry table = db.table(tableName);
    List<String> columns = parseColumns(table.sql());

    if (columnsPart.equalsIgnoreCase("count(*)") && whereColumn == null) {
      OUT.println(db.countRows(table.rootPage()));
      return;
    }

    List<Integer> projection = new ArrayList<>();
    boolean count = columnsPart.equalsIgnoreCase("count(*)");
    if (!count) {
      for (String column : columnsPart.split(",")) projection.add(columnIndex(columns, column.trim()));
    }
    int whereIndex = whereColumn == null ? -1 : columnIndex(columns, whereColumn);
    int rowidAlias = rowidAliasIndex(table.sql(), columns);

    List<Row> rows = new ArrayList<>();
    SchemaEntry index = whereColumn == null ? null : db.indexFor(tableName, whereColumn);
    if (index != null) {
      List<Long> rowids = new ArrayList<>();
      db.indexLookup(index.rootPage(), whereValue, rowids);
      for (long rowid : rowids) {
        Row row = db.findRow(table.rootPage(), rowid);
        if (row != null) rows.add(row);
      }
    } else {
      db.scan(table.rootPage(), rows);
    }

    long matched = 0;
    for (Row row : rows) {
      if (whereIndex >= 0) {
        Object value = valueAt(row, whereIndex, rowidAlias);
        if (value == null || !String.valueOf(value).equals(whereValue)) continue;
      }
      matched++;
      if (count) continue;
      StringBuilder line = new StringBuilder();
      for (int i = 0; i < projection.size(); i++) {
        if (i > 0) line.append('|');
        Object value = valueAt(row, projection.get(i), rowidAlias);
        line.append(value == null ? "" : format(value));
      }
      OUT.println(line);
    }
    if (count) OUT.println(matched);
  }

  static Object valueAt(Row row, int index, int rowidAlias) {
    if (index == rowidAlias) return row.rowid();
    return index < row.values().size() ? row.values().get(index) : null;
  }

  static String format(Object value) {
    if (value instanceof Double d && d == Math.rint(d)) return String.format(Locale.ROOT, "%.1f", d);
    return String.valueOf(value);
  }

  static int columnIndex(List<String> columns, String name) {
    for (int i = 0; i < columns.size(); i++) if (columns.get(i).equalsIgnoreCase(name)) return i;
    throw new IllegalArgumentException("coluna desconhecida: " + name);
  }

  /** Extrai os nomes das colunas de um CREATE TABLE (ignorando constraints de tabela). */
  static List<String> parseColumns(String createSql) {
    String body = createSql.substring(createSql.indexOf('(') + 1, createSql.lastIndexOf(')'));
    List<String> columns = new ArrayList<>();
    int depth = 0;
    StringBuilder current = new StringBuilder();
    for (char c : body.toCharArray()) {
      if (c == '(') depth++;
      if (c == ')') depth--;
      if (c == ',' && depth == 0) {
        addColumn(columns, current.toString());
        current.setLength(0);
      } else {
        current.append(c);
      }
    }
    addColumn(columns, current.toString());
    return columns;
  }

  static void addColumn(List<String> columns, String definition) {
    String trimmed = definition.trim();
    if (trimmed.isEmpty()) return;
    String first = trimmed.split("\\s+")[0];
    String upper = first.toUpperCase(Locale.ROOT);
    if (List.of("PRIMARY", "UNIQUE", "CHECK", "FOREIGN", "CONSTRAINT").contains(upper)) return;
    columns.add(first.replaceAll("^[\"`\\[]|[\"`\\]]$", ""));
  }

  /** A coluna declarada "INTEGER PRIMARY KEY" é um alias do rowid: o registro guarda NULL nela. */
  static int rowidAliasIndex(String createSql, List<String> columns) {
    String body = createSql.substring(createSql.indexOf('(') + 1, createSql.lastIndexOf(')'));
    String[] definitions = body.split(",");
    for (String definition : definitions) {
      String normalized = definition.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
      if (normalized.matches("^\\S+ integer primary key.*")) {
        String name = definition.trim().split("\\s+")[0];
        return columnIndex(columns, name.replaceAll("^[\"`\\[]|[\"`\\]]$", ""));
      }
    }
    return -1;
  }

  // ----------------------------------------------------------- file format

  record SchemaEntry(String type, String name, String tableName, int rootPage, String sql) {}

  record Row(long rowid, List<Object> values) {}

  static final class Database implements AutoCloseable {
    final RandomAccessFile file;
    final int pageSize;
    List<SchemaEntry> schema;

    Database(String path) throws IOException {
      file = new RandomAccessFile(path, "r");
      byte[] header = new byte[100];
      file.readFully(header);
      int size = u16(header, 16);
      pageSize = size == 1 ? 65536 : size;
    }

    byte[] page(int number) throws IOException {
      byte[] page = new byte[pageSize];
      file.seek((long) (number - 1) * pageSize);
      file.readFully(page);
      return page;
    }

    static int headerOffset(int number) {
      return number == 1 ? 100 : 0;
    }

    List<SchemaEntry> schema() throws IOException {
      if (schema != null) return schema;
      List<Row> rows = new ArrayList<>();
      scan(1, rows);
      schema = new ArrayList<>();
      for (Row row : rows) {
        List<Object> v = row.values();
        schema.add(new SchemaEntry((String) v.get(0), (String) v.get(1), (String) v.get(2),
            ((Long) v.get(3)).intValue(), (String) v.get(4)));
      }
      return schema;
    }

    SchemaEntry table(String name) throws IOException {
      for (SchemaEntry entry : schema()) {
        if (entry.type().equals("table") && entry.name().equalsIgnoreCase(name)) return entry;
      }
      throw new IllegalArgumentException("tabela não encontrada: " + name);
    }

    SchemaEntry indexFor(String table, String column) throws IOException {
      for (SchemaEntry entry : schema()) {
        if (!entry.type().equals("index") || entry.sql() == null) continue;
        if (!entry.tableName().equalsIgnoreCase(table)) continue;
        String inside = entry.sql().substring(entry.sql().indexOf('(') + 1, entry.sql().lastIndexOf(')'));
        String first = inside.split(",")[0].trim().split("\\s+")[0].replaceAll("^[\"`\\[]|[\"`\\]]$", "");
        if (first.equalsIgnoreCase(column)) return entry;
      }
      return null;
    }

    /** Conta as linhas sem decodificar registros: soma as células das folhas. */
    long countRows(int pageNumber) throws IOException {
      byte[] page = page(pageNumber);
      int h = headerOffset(pageNumber);
      int type = page[h] & 0xff;
      int cells = u16(page, h + 3);
      if (type == 0x0d) return cells;
      long total = 0;
      for (int i = 0; i < cells; i++) {
        int cell = u16(page, h + 12 + 2 * i);
        total += countRows((int) u32(page, cell));
      }
      return total + countRows((int) u32(page, h + 8));
    }

    /** Percorre toda a B-tree de tabela, na ordem dos rowids. */
    void scan(int pageNumber, List<Row> out) throws IOException {
      byte[] page = page(pageNumber);
      int h = headerOffset(pageNumber);
      int type = page[h] & 0xff;
      int cells = u16(page, h + 3);
      if (type == 0x0d) {
        for (int i = 0; i < cells; i++) out.add(readLeafCell(page, u16(page, h + 8 + 2 * i)));
      } else if (type == 0x05) {
        for (int i = 0; i < cells; i++) scan((int) u32(page, u16(page, h + 12 + 2 * i)), out);
        scan((int) u32(page, h + 8), out);
      } else {
        throw new IllegalStateException("página " + pageNumber + " não é de tabela (tipo " + type + ")");
      }
    }

    /** Desce pela B-tree de tabela até a folha que contém o rowid. */
    Row findRow(int pageNumber, long rowid) throws IOException {
      while (true) {
        byte[] page = page(pageNumber);
        int h = headerOffset(pageNumber);
        int type = page[h] & 0xff;
        int cells = u16(page, h + 3);
        if (type == 0x0d) {
          for (int i = 0; i < cells; i++) {
            Row row = readLeafCell(page, u16(page, h + 8 + 2 * i));
            if (row.rowid() == rowid) return row;
          }
          return null;
        }
        int next = (int) u32(page, h + 8);
        for (int i = 0; i < cells; i++) {
          int cell = u16(page, h + 12 + 2 * i);
          long key = readVarint(page, cell + 4)[0];
          if (rowid <= key) {
            next = (int) u32(page, cell);
            break;
          }
        }
        pageNumber = next;
      }
    }

    /** Coleta os rowids das entradas do índice cuja primeira coluna é igual a value. */
    void indexLookup(int pageNumber, String value, List<Long> out) throws IOException {
      byte[] page = page(pageNumber);
      int h = headerOffset(pageNumber);
      int type = page[h] & 0xff;
      int cells = u16(page, h + 3);
      byte[] target = value.getBytes(StandardCharsets.UTF_8);
      if (type == 0x0a) {
        for (int i = 0; i < cells; i++) {
          int cell = u16(page, h + 8 + 2 * i);
          List<Object> record = readIndexRecord(page, cell);
          int cmp = compare(record.get(0), target);
          if (cmp == 0) out.add((Long) record.get(record.size() - 1));
          if (cmp > 0) return;
        }
        return;
      }
      if (type != 0x02) throw new IllegalStateException("página " + pageNumber + " não é de índice");
      for (int i = 0; i < cells; i++) {
        int cell = u16(page, h + 12 + 2 * i);
        int child = (int) u32(page, cell);
        List<Object> record = readIndexRecord(page, cell + 4);
        int cmp = compare(record.get(0), target);
        if (cmp >= 0) indexLookup(child, value, out);
        if (cmp == 0) out.add((Long) record.get(record.size() - 1));
        if (cmp > 0) return;
      }
      indexLookup((int) u32(page, h + 8), value, out);
    }

    static int compare(Object key, byte[] target) {
      if (key == null) return -1; // NULL vem antes de qualquer texto
      if (!(key instanceof String text)) return -1; // números vêm antes de texto
      return Arrays.compareUnsigned(text.getBytes(StandardCharsets.UTF_8), target);
    }

    List<Object> readIndexRecord(byte[] page, int offset) {
      long[] payloadSize = readVarint(page, offset);
      return readRecord(page, offset + (int) payloadSize[1]);
    }

    Row readLeafCell(byte[] page, int offset) {
      long[] payloadSize = readVarint(page, offset);
      long[] rowid = readVarint(page, offset + (int) payloadSize[1]);
      int recordStart = offset + (int) payloadSize[1] + (int) rowid[1];
      return new Row(rowid[0], readRecord(page, recordStart));
    }

    @Override
    public void close() throws IOException {
      file.close();
    }
  }

  // -------------------------------------------------------------- records

  static List<Object> readRecord(byte[] page, int start) {
    long[] headerSize = readVarint(page, start);
    int headerEnd = start + (int) headerSize[0];
    int cursor = start + (int) headerSize[1];
    List<Long> serialTypes = new ArrayList<>();
    while (cursor < headerEnd) {
      long[] serial = readVarint(page, cursor);
      serialTypes.add(serial[0]);
      cursor += (int) serial[1];
    }
    List<Object> values = new ArrayList<>();
    int body = headerEnd;
    for (long serial : serialTypes) {
      switch ((int) Math.min(serial, 12)) {
        case 0 -> values.add(null);
        case 1 -> { values.add((long) page[body]); body += 1; }
        case 2 -> { values.add((long) (short) u16(page, body)); body += 2; }
        case 3 -> { values.add(signed(page, body, 3)); body += 3; }
        case 4 -> { values.add(signed(page, body, 4)); body += 4; }
        case 5 -> { values.add(signed(page, body, 6)); body += 6; }
        case 6 -> { values.add(signed(page, body, 8)); body += 8; }
        case 7 -> { values.add(Double.longBitsToDouble(signed(page, body, 8))); body += 8; }
        case 8 -> values.add(0L);
        case 9 -> values.add(1L);
        default -> {
          if (serial % 2 == 0) {
            int length = (int) ((serial - 12) / 2);
            values.add(Arrays.copyOfRange(page, body, body + length));
            body += length;
          } else {
            int length = (int) ((serial - 13) / 2);
            values.add(new String(page, body, length, StandardCharsets.UTF_8));
            body += length;
          }
        }
      }
    }
    return values;
  }

  static long signed(byte[] data, int offset, int bytes) {
    long value = data[offset]; // byte mais significativo com sinal
    for (int i = 1; i < bytes; i++) value = (value << 8) | (data[offset + i] & 0xff);
    return value;
  }

  /** Varint do SQLite: até 9 bytes, big-endian, bit alto = continua; o 9º byte usa os 8 bits. */
  static long[] readVarint(byte[] data, int offset) {
    long value = 0;
    for (int i = 0; i < 8; i++) {
      int b = data[offset + i] & 0xff;
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) == 0) return new long[] {value, i + 1};
    }
    value = (value << 8) | (data[offset + 8] & 0xff);
    return new long[] {value, 9};
  }

  static int u16(byte[] data, int offset) {
    return ((data[offset] & 0xff) << 8) | (data[offset + 1] & 0xff);
  }

  static long u32(byte[] data, int offset) {
    return ((long) (data[offset] & 0xff) << 24) | ((data[offset + 1] & 0xff) << 16)
        | ((data[offset + 2] & 0xff) << 8) | (data[offset + 3] & 0xff);
  }
}
