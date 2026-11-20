> **Em uma frase:** exceção não é sinônimo de erro: é um contrato sobre o que pode falhar, quem consegue reagir e qual contexto precisa sobreviver até o log.

Toda aplicação Java em produção falha. A diferença entre um incidente curto e uma madrugada de investigação raramente está no `try/catch`; está na decisão de o que declarar, o que deixar estourar e o que anexar à falha antes de relançá-la. É design de API, decidido muito antes do primeiro erro.

## O problema

Considere um serviço que lê um CSV, valida linhas e grava em um banco. O arquivo pode não existir, a linha pode ter data inválida, o banco pode estar fora. Se você trata os três com `catch (Exception e) { e.printStackTrace(); }`, o método sempre "funciona", o job termina com sucesso e ninguém descobre que 40% das linhas foram descartadas. O inverso também dói: `throws Exception` obriga todo chamador a capturar tudo e a assinatura deixa de dizer algo útil.

## Como funciona

Tudo que pode ser lançado herda de `Throwable`. Três galhos importam:

| Tipo | Exemplos | Compilador exige? | Postura |
|---|---|---|---|
| `Error` | `OutOfMemoryError`, `StackOverflowError` | Não | Não capture; a JVM está em estado irrecuperável |
| `RuntimeException` | `NullPointerException`, `IllegalArgumentException` | Não | Bug ou violação de contrato: corrija o código |
| `Exception` checked | `IOException`, `SQLException` | Sim: `catch` ou `throws` | Falha esperada de fronteira, recuperável |

A pergunta que decide o galho não é "isso dá erro?", é "quem pode reagir?". Se o chamador consegue agir — tentar de novo, pedir outro arquivo, mostrar uma mensagem — a falha é checked e faz parte do contrato. Se a única resposta é corrigir o código, lançar `IllegalArgumentException` ou deixar o `NullPointerException` subir é mais honesto do que obrigar `try/catch` em toda a base.

Critério prático:

- **Checked** quando a falha depende do ambiente e o chamador tem alternativa real: `IOException`, timeout, recusa de pagamento.
- **Unchecked** quando é violação de pré-condição ou estado impossível: argumento nulo, índice inválido, configuração ausente no boot.
- **Error** quando o problema é da plataforma: memória, pilha, linkage. No máximo registre no topo e encerre.

Custo escondido: `Function<T,R>` não declara `throws`; dentro de lambdas, checked vira `RuntimeException` embrulhada. Evite checked em código consumido por streams.

## Projetando a exceção

Uma exceção de domínio carrega três coisas: o que falhou, com quais dados e a causa original. Sem os dados, o log diz "pagamento recusado" e você não sabe qual transação. Sem a causa, perde o stack trace do driver.

```java
public class PagamentoRecusadoException extends Exception {
    private final String transacaoId;
    private final int codigoRetorno;

    public PagamentoRecusadoException(String transacaoId, int codigoRetorno, Throwable causa) {
        super("Pagamento recusado: transação=" + transacaoId + ", código=" + codigoRetorno, causa);
        this.transacaoId = transacaoId;
        this.codigoRetorno = codigoRetorno;
    }

    public String transacaoId() { return transacaoId; }
    public int codigoRetorno() { return codigoRetorno; }
}
```

`super(mensagem, causa)` preenche `getCause()` e imprime "Caused by: ..." no stack trace. `initCause(e)` só funciona uma vez e falha se a causa já existe; prefira o construtor. Nunca coloque senha, token ou CPF na mensagem: o log sai do perímetro de confiança.

## Na prática

`try-with-resources` fecha recursos em ordem inversa, mesmo com exceção, e preserva a falha principal. Se o corpo lança e o `close()` também, a segunda vira **suprimida** — não sobrescreve a primeira.

```java
import java.io.IOException;
import java.nio.file.*;

public class Importador {

    public static void copiar(Path origem, Path destino) throws IOException {
        try (var entrada = Files.newInputStream(origem);
             var saida = Files.newOutputStream(destino)) {
            entrada.transferTo(saida);
        }
    }
}
```

Se precisar inspecionar as suprimidas, `e.getSuppressed()` devolve o array. Um `finally` manual com `close()` perde a exceção original quando o fechamento falha — é o bug que o try-with-resources elimina.

Para traduzir falhas de infraestrutura em falhas de domínio sem perder a origem:

```java
import java.io.IOException;
import java.nio.file.*;

class FalhaRelatorioException extends Exception {
    FalhaRelatorioException(String mensagem, Throwable causa) { super(mensagem, causa); }
}

class RelatorioService {

    public String carregar(Path caminho) throws FalhaRelatorioException {
        try {
            return Files.readString(caminho);
        } catch (NoSuchFileException | AccessDeniedException e) {
            throw new FalhaRelatorioException("não foi possível ler " + caminho, e);
        } catch (IOException e) {
            throw new FalhaRelatorioException("falha de I/O em " + caminho, e);
        }
    }
}
```

`NoSuchFileException | AccessDeniedException` é multi-catch: `e` é implicitamente `final` e recebe o tipo comum (`FileSystemException`). O `catch` específico vem antes do genérico; inverter gera erro de compilação por código inalcançável.

**Embrulhar ou propagar?** Embrulhe quando a camada adiciona informação (qual arquivo, qual transação) ou traduz vocabulário (`SQLException` para `FalhaAoPersistirException`). Propague quando não há nada a acrescentar. Não faça as duas coisas: `log.error(...); throw e;` duplica a linha no log e, se o topo também registra, você investiga o mesmo incidente três vezes.

## Armadilhas comuns

- **`catch (Exception e) {}`** — engole tudo, inclusive o `NullPointerException` de um bug seu. Se capturar amplo, relance ou registre e falhe.
- **`e.printStackTrace()`** — escreve em `System.err`, fora do log estruturado, sem correlation ID. Em container, ninguém vê.
- **`throw new RuntimeException(e.getMessage())`** — destrói tipo, stack e causa. Use `new RuntimeException(mensagem, e)`.
- **`catch (Throwable t)`** — captura `OutOfMemoryError` e deixa a aplicação inconsistente.
- **Exceção como fluxo normal** — `NumberFormatException` para testar se a string é número, em loop, custa caro: `fillInStackTrace` percorre a pilha.

## Checklist de domínio

- [ ] Você escolhe checked ou unchecked pelo critério "quem consegue reagir"
- [ ] Sua exceção de domínio carrega contexto e causa no construtor
- [ ] Você identifica um `catch` que engole a falha ou duplica log
- [ ] Você fecha recursos com try-with-resources e sabe olhar as suprimidas
- [ ] Você usa multi-catch sem inverter a ordem dos tipos

## Para ir além

- [Oracle — Lesson: Exceptions](https://docs.oracle.com/javase/tutorial/essential/exceptions/): guia oficial.
- [Java Language Specification, capítulo 11](https://docs.oracle.com/javase/specs/jls/se21/html/jls-11.html): definição normativa, incluindo suprimidas.
- [Baeldung — Checked and Unchecked Exceptions](https://www.baeldung.com/java-checked-unchecked-exceptions): comparação com exemplos.
