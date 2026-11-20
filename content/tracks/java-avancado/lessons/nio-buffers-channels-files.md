> **Em uma frase:** NIO troca a simplicidade dos streams por controle explícito de buffers e canais — e esse controle é o que permite processar arquivos de vários GB com memória constante.

## O problema

Um job usa `Files.readAllBytes` em um CSV de 4 GB com heap de 2 GB; o processo morre com `OutOfMemoryError` antes da primeira linha. Em outro, `FileChannel` com `ByteBuffer` sem `flip()`: lê lixo, grava arquivo truncado ou entra em loop porque `hasRemaining()` nunca fica falso.

NIO não é "I/O mais rápido" por decreto: é uma API de estado explícito, onde errar posição, limite ou capacidade produz bugs silenciosos.

## Como funciona

Um `ByteBuffer` tem três propriedades: **capacity** (tamanho total), **position** (onde a próxima leitura/escrita acontece) e **limit** (até onde é permitido ir). O ciclo é sempre o mesmo: escreve até encher, `flip()` para ler, `clear()` ou `compact()` para escrever de novo.

| Operação | position | limit | Quando usar |
|---|---|---|---|
| `flip()` | 0 | position anterior | terminar escrita, começar leitura |
| `clear()` | 0 | capacity | descartar tudo e reescrever |
| `compact()` | bytes restantes | capacity | preservar o que não foi lido |

`flip()` não inverte bytes; ele transforma o "fim do que foi escrito" no "fim do que pode ser lido". `clear()` não zera o conteúdo, apenas reposiciona os ponteiros. `compact()` move os bytes não lidos para o início e prepara o buffer para completar uma mensagem parcial.

```java
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public class CopiaComBuffer {
    public static void main(String[] args) throws IOException {
        Path origem = Path.of("origem.bin");
        Path destino = Path.of("destino.bin");
        ByteBuffer buffer = ByteBuffer.allocateDirect(64 * 1024);

        try (FileChannel in = FileChannel.open(origem, StandardOpenOption.READ);
             FileChannel out = FileChannel.open(destino,
                     StandardOpenOption.CREATE,
                     StandardOpenOption.WRITE,
                     StandardOpenOption.TRUNCATE_EXISTING)) {

            long total = 0;
            int lidos;
            while ((lidos = in.read(buffer)) != -1) {
                total += lidos;
                buffer.flip();                 // prepara para leitura
                while (buffer.hasRemaining()) {
                    out.write(buffer);          // write pode ser parcial
                }
                buffer.clear();                // reutiliza o mesmo buffer
            }
            System.out.println("bytes=" + total);
        }
    }
}
```

`FileChannel.read` e `write` podem transferir menos que o pedido. O loop interno de `write` é obrigatório; assumir que tudo foi escrito é um bug clássico. O buffer de 64 KB é reutilizado: para 1 GB, são ~16 mil syscalls de microssegundos, em vez de milhões de chamadas de 1 byte.

**Heap vs direct:** `allocateDirect` cria memória nativa fora do heap. A cópia para o kernel pode evitar uma etapa, mas a alocação é cara e o buffer só é liberado quando o `ByteBuffer` e seu `Cleaner` ficam inalcançáveis. Sem `-XX:MaxDirectMemorySize`, o limite é a RAM do processo; o sintoma de vazamento é RSS alto com heap saudável, ou `OutOfMemoryError: Direct buffer memory`. Para buffers de vida curta e volume alto, prefira heap; para I/O intenso e reutilizado, direct.

## Na prática

Para copiar arquivos, `FileChannel.transferTo` pode delegar ao kernel (`sendfile`) e evitar cópias para o espaço do usuário. Ele também pode transferir menos que o solicitado, então o loop é necessário:

```java
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public class CopiaZeroCopy {
    public static void main(String[] args) throws IOException {
        Path origem = Path.of("origem.bin");
        Path destino = Path.of("destino.bin");
        long tamanho = java.nio.file.Files.size(origem);

        try (FileChannel in = FileChannel.open(origem, StandardOpenOption.READ);
             FileChannel out = FileChannel.open(destino,
                     StandardOpenOption.CREATE,
                     StandardOpenOption.WRITE,
                     StandardOpenOption.TRUNCATE_EXISTING)) {

            long posicao = 0;
            while (posicao < tamanho) {
                long enviados = in.transferTo(posicao, tamanho - posicao, out);
                if (enviados == 0) break; // evita loop infinito em plataformas sem progresso
                posicao += enviados;
            }
            System.out.println("copiados=" + posicao);
        }
    }
}
```

Para varrer um arquivo grande sem carregá-lo, `FileChannel.map` cria um `MappedByteBuffer` apoiado no page cache: o sistema traz páginas sob demanda e o heap não guarda o arquivo inteiro. Como o índice do buffer é `int`, mapeie em janelas menores que 2 GB:

```java
import java.io.IOException;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public class ContaLinhasMmap {
    public static void main(String[] args) throws IOException {
        Path arquivo = Path.of("grande.log");
        long tamanho = Files.size(arquivo);
        long janela = 256L * 1024 * 1024;
        long linhas = 0;

        try (FileChannel channel = FileChannel.open(arquivo, StandardOpenOption.READ)) {
            for (long offset = 0; offset < tamanho; offset += janela) {
                long bytes = Math.min(janela, tamanho - offset);
                MappedByteBuffer mapa = channel.map(
                        FileChannel.MapMode.READ_ONLY, offset, bytes);
                for (int i = 0; i < mapa.limit(); i++) {
                    if (mapa.get(i) == '\n') linhas++;
                }
            }
        }
        System.out.println("linhas=" + linhas);
    }
}
```

Mmap é ótimo para leitura aleatória e arquivos grandes, mas cobra page faults, pressão no page cache e falta de desmapeamento determinístico no Java 21. Se o arquivo for truncado enquanto mapeado, um acesso pode gerar `SIGBUS`; no Windows, ele pode ficar travado até o buffer ser coletado.

Para texto, não adivinhe o charset. Use `Files.newBufferedReader(path, StandardCharsets.UTF_8)`, `Files.lines(path, UTF_8)` dentro de `try-with-resources`, ou `Files.readString` apenas quando o arquivo cabe no heap (lembre que `String` é limitada a ~2 GB).

## Armadilhas comuns

- **Esquecer `flip()` antes de ler.** O buffer continua em modo escrita; `limit` é a capacidade e você lê bytes não escritos.
- **Usar `clear()` antes de consumir tudo.** Os bytes não lidos são perdidos. Para framing parcial, use `compact()`.
- **Assumir escrita completa.** `FileChannel.write` pode retornar menos que `remaining()`.
- **Ignorar o retorno de `transferTo`.** Ele não garante transferir todo o intervalo em uma chamada.
- **Vazar direct buffers.** Eles vivem fora do heap e dependem do `Cleaner`; um pool sem limite reproduz o problema.
- **Mapear arquivos gigantes em um único `MappedByteBuffer`.** O limite de índice é `int`; use janelas.

## Checklist de domínio

- [ ] Você explica capacity, position e limit sem consultar
- [ ] Você usa `flip`, `clear` e `compact` no momento certo
- [ ] Você trata leitura e escrita parciais em canal
- [ ] Você escolhe entre buffer heap, direct, mmap e transferTo
- [ ] Você processa um arquivo maior que o heap com memória constante

## Para ir além

- [Oracle — ByteBuffer](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/ByteBuffer.html)
- [Oracle — FileChannel](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/channels/FileChannel.html)
- [Baeldung — Java FileChannel](https://www.baeldung.com/java-filechannel)
