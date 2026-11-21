import java.io.IOException;

/**
 * Build your own Redis — implementação de referência.
 *
 *   ./your_program.sh --port 6380 --replicaof "localhost 6379" --dir /tmp --dbfilename dump.rdb
 *   ./your_program.sh --appendonly yes --appenddirname aof --appendfilename dados.aof
 */
public class Main {
  static final class Config {
    int port = 6379;
    String replicaOf;
    String dir = System.getProperty("user.dir");
    String dbFilename = "dump.rdb";
    String appendOnly = "no";
    String appendDirName = "appendonlydir";
    String appendFilename = "appendonly.aof";
    String appendFsync = "everysec";

    String get(String name) {
      return switch (name.toLowerCase()) {
        case "dir" -> dir;
        case "dbfilename" -> dbFilename;
        case "appendonly" -> appendOnly;
        case "appenddirname" -> appendDirName;
        case "appendfilename" -> appendFilename;
        case "appendfsync" -> appendFsync;
        case "port" -> String.valueOf(port);
        default -> null;
      };
    }
  }

  public static void main(String[] args) throws IOException {
    Config config = new Config();
    for (int i = 0; i + 1 < args.length; i += 2) {
      String value = args[i + 1];
      switch (args[i]) {
        case "--port" -> config.port = Integer.parseInt(value);
        case "--replicaof" -> config.replicaOf = value;
        case "--dir" -> config.dir = value;
        case "--dbfilename" -> config.dbFilename = value;
        case "--appendonly" -> config.appendOnly = value;
        case "--appenddirname" -> config.appendDirName = value;
        case "--appendfilename" -> config.appendFilename = value;
        case "--appendfsync" -> config.appendFsync = value;
        default -> System.err.println("opção desconhecida: " + args[i]);
      }
    }
    new Server(config).start();
  }
}
