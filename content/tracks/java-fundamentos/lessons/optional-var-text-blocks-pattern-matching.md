> **Em uma frase:** `Optional` documenta ausência na borda da API, `var` reduz ruído local sem virar tipagem dinâmica, text blocks preservam texto multilinha e pattern matching elimina casts manuais.

## O problema

Um método `buscarCliente` devolvia `null` quando não encontrava. O chamador esquecia de checar e o `NullPointerException` aparecia três camadas depois, longe da causa. Outro método devolvia `Optional` e o time fazia `optional.get()` sem `isPresent()`, recriando o mesmo problema com mais cerimônia.

Java moderno oferece ferramentas para tornar ausência e forma explícitas. Elas não eliminam a necessidade de pensar; apenas dão ao compilador e ao leitor mais informação sobre a intenção.

## Como funciona

`Optional<T>` é um contêiner que pode ter zero ou um valor. A regra prática: use como **retorno** de métodos que podem não encontrar algo. Não use como campo de entidade, parâmetro obrigatório ou elemento de lista — nesses casos, `null` ou uma modelagem específica é mais simples.

```java
import java.util.Optional;

public class BuscaCliente {
    record Cliente(String nome, String email) {}

    static Optional<Cliente> buscar(String id) {
        if ("1".equals(id)) return Optional.of(new Cliente("Ana", "ana@exemplo.com"));
        return Optional.empty();
    }

    public static void main(String[] args) {
        String nome = buscar("1")
            .map(Cliente::nome)
            .orElse("desconhecido");
        System.out.println(nome); // Ana

        String email = buscar("2")
            .map(Cliente::email)
            .orElseGet(() -> "sem-email@exemplo.com");
        System.out.println(email); // sem-email@exemplo.com

        buscar("3").ifPresentOrElse(
            c -> System.out.println("achei " + c.nome()),
            () -> System.out.println("não achei")
        );
    }
}
```

`map` transforma o valor se presente e mantém vazio se ausente; `flatMap` faz o mesmo quando a função já devolve `Optional`. `orElse` avalia o valor padrão sempre; `orElseGet` executa o `Supplier` só quando necessário. Em um padrão que consulta o banco, essa diferença custa uma query.

`var` infere o tipo estático de uma variável local a partir do inicializador. Não é `dynamic`: depois de inferido, o tipo não muda. Só funciona com inicialização e apenas para variáveis locais.

```java
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class VarDemo {
    public static void main(String[] args) {
        var nome = "Ana";                    // String
        var idade = 42;                      // int
        var tags = List.of("java", "jvm");   // List<String>
        var indice = new HashMap<String, List<Integer>>();

        indice.computeIfAbsent("pares", k -> new ArrayList<>()).add(2);
        System.out.println(nome + " " + idade + " " + tags + " " + indice);

        // var vazio; // não compila: sem inicializador
        // var numeros = new ArrayList<>(); // infere ArrayList<Object>, não o que você quer
    }
}
```

`var` melhora a legibilidade quando o tipo aparece dos dois lados: `Map<String, List<Cliente>> mapa = new HashMap<>();` vira `var mapa = new HashMap<String, List<Cliente>>();`. Não use quando o tipo real não é óbvio; o leitor não deve precisar abrir a implementação para saber o que é.

## Na prática

**Text blocks** resolvem strings multilinha sem `\n` e sem concatenação. O delimitador é `"""` seguido de quebra de linha. A indentação comum é removida; a posição do fechamento define o mínimo.

```java
public class TextBlocks {
    public static void main(String[] args) {
        String sql = """
                SELECT id, nome
                FROM clientes
                WHERE ativo = true
                ORDER BY nome
                """;
        System.out.println(sql);

        String json = """
                {"id": %d, "nome": "%s"}
                """.formatted(42, "Ana");
        System.out.println(json);

        // \s preserva um espaço final; \ continua a linha sem quebra
        String aviso = """
                Atenção:\s
                revise o pedido \
                antes de enviar.
                """;
        System.out.println(aviso);
    }
}
```

Text block não faz interpolação. `formatted` é o caminho para valores dinâmicos, e continua sendo obrigatório usar `PreparedStatement` em SQL — o bloco é só formatação, não proteção contra injeção.

**Pattern matching** elimina o cast depois de `instanceof` e permite desestruturar records em `switch`. Com uma hierarquia `sealed`, o compilador exige que todos os casos sejam cobertos.

```java
public class Eventos {
    sealed interface Evento permits PedidoCriado, PedidoCancelado {}
    record PedidoCriado(long id, long totalCentavos) implements Evento {}
    record PedidoCancelado(long id, String motivo) implements Evento {}

    static String resumo(Evento evento) {
        return switch (evento) {
            case PedidoCriado(long id, long total) when total > 100_000 ->
                "pedido grande " + id;
            case PedidoCriado(long id, long total) -> "pedido " + id;
            case PedidoCancelado(long id, String motivo) ->
                "cancelado " + id + ": " + motivo;
        };
    }

    public static void main(String[] args) {
        System.out.println(resumo(new PedidoCriado(10, 250_000)));
        System.out.println(resumo(new PedidoCancelado(11, "sem estoque")));
    }
}
```

A guarda `when` adiciona uma condição ao padrão. A ordem importa: o caso mais específico precisa vir antes do genérico, ou o compilador acusa padrão inalcançável.

## Armadilhas comuns

- **Usar `Optional.get()` sem verificar.** Prefira `orElseThrow`, `map` ou `ifPresent`. `get` é o novo `null` disfarçado.
- **Colocar `Optional` em campos e DTOs.** A serialização fica estranha e o contrato piora. Use na saída de métodos de consulta.
- **`var` com tipo inferido indesejado.** `var lista = new ArrayList<>()` vira `ArrayList<Object>`. Declare o tipo genérico no construtor.
- **Pattern matching sem ordem.** `case Object o` antes de um caso específico torna o específico inalcançável; o compilador reclama, mas a correção exige repensar a hierarquia.

## Checklist de domínio

- [ ] Você usa `Optional` como retorno e evita `get()`
- [ ] Você sabe quando `var` ajuda e quando esconde informação
- [ ] Você escreve text blocks com indentação e `formatted`
- [ ] Você usa record patterns e guardas em switch exaustivo

## Para ir além

- [Java SE 21 API — Optional](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Optional.html): todos os métodos e semântica.
- [JEP 378 — Text Blocks](https://openjdk.org/jeps/378): regras de indentação incidental e escapes.
- [JEP 441 — Pattern Matching for switch](https://openjdk.org/jeps/441): padrões, guardas e exaustividade.
