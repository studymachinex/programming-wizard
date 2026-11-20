import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Build your own Git — o seu programa é executado como um comando git:
 *
 *   ./your_program.sh init
 *   ./your_program.sh cat-file -p <sha>
 *   ...
 *
 * O diretório atual (cwd) é o repositório. Rode `npm run cc -- task` para ver o stage atual.
 */
public class Main {
  public static void main(String[] args) throws IOException {
    if (args.length == 0) {
      System.err.println("uso: your_program.sh <comando> [<args>...]");
      System.exit(1);
    }

    final String command = args[0];
    switch (command) {
      case "init" -> {
        // TODO (stage 1): crie .git/, .git/objects/, .git/refs/ e o arquivo .git/HEAD
        // contendo "ref: refs/heads/main\n". Depois imprima "Initialized git directory".
        //
        // final Path git = Path.of(".git");
        // Files.createDirectories(git.resolve("objects"));
        // Files.createDirectories(git.resolve("refs"));
        // Files.writeString(git.resolve("HEAD"), "ref: refs/heads/main\n");
        // System.out.println("Initialized git directory");
        System.err.println("init ainda não implementado");
        System.exit(1);
      }
      // Próximos stages: "cat-file", "hash-object", "ls-tree", "write-tree",
      // "commit-tree" e "clone".
      default -> {
        System.err.println("Unknown command: " + command);
        System.exit(1);
      }
    }
  }
}
