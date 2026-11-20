import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

/**
 * Build your own Tokenizer — um tokenizer BPE do zero, até bater com o GPT-2.
 *
 * Toda entrada chega pelo stdin; o primeiro argumento é o comando:
 *
 *   echo -n "hello" | ./your_program.sh bytes
 *
 * Rode `npm run cc -- task` para ver o stage atual.
 */
public class Main {
  // Saída sempre em UTF-8, independente do sistema operacional.
  static final PrintStream OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);

  public static void main(String[] args) throws IOException {
    if (args.length == 0) {
      System.err.println("uso: your_program.sh <comando> [<args>...] < entrada");
      System.exit(1);
    }

    byte[] input = System.in.readAllBytes();
    switch (args[0]) {
      case "bytes" -> {
        // TODO (stage 1): imprima cada byte de `input` como número de 0 a 255,
        // separados por espaço, em uma única linha. Cuidado: byte em Java tem sinal.
        System.err.println("bytes ainda não implementado (" + input.length + " bytes recebidos)");
        System.exit(1);
      }
      // Próximos stages: "pair", "merge", "train", "encode", "decode", "split" e "gpt2".
      default -> {
        System.err.println("Unknown command: " + args[0]);
        System.exit(1);
      }
    }
    OUT.flush();
  }
}
