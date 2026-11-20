> **Em uma frase:** um Stream é uma receita lazy que só executa quando uma operação terminal pede resultado, e o Collector é o contrato que decide como esse resultado é acumulado, combinado e finalizado.

## O problema

O pipeline "óbvio" chama `filter`, `map` e `sorted` e o time jura que ele percorre a lista uma vez. Em produção, aparecem três cópias intermediárias, um `toMap` que estoura com `IllegalStateException` na primeira duplicata e um `groupingBy` que devolve `HashMap` — então a ordem que o relatório exibia some. Pior: um collector escrito à mão funciona nos testes sequenciais e produz números errados quando alguém adiciona `parallel()`.

Streams não são loops disfarçados. São uma DSL com regras de execução, e quem não conhece o contrato do `Collector` descobre o problema no incidente.

## Como funciona

Um pipeline tem uma fonte, zero ou mais operações intermediárias e uma operação terminal. As intermediárias são **lazy**: `filter`, `map` e `flatMap` apenas devolvem um novo `Stream` com a descrição do trabalho. Nada percorre a fonte até `collect`, `reduce`, `forEach`, `count` ou `findFirst`. Quando a terminal roda, cada elemento atravessa todos os estágios antes de o próximo entrar — não há uma lista nova por etapa.

```java
import java.util.List;
import java.util.stream.Stream;

public class LazyDemo {
    public static void main(String[] args) {
        List<String> nomes = List.of("ana", "bruno", "carla", "diego", "elisa");

        System.out.println("montando o pipeline");
        Stream<String> pipeline = nomes.stream()
                .filter(n -> {
                    System.out.println("filter " + n);
                    return n.length() > 3;
                })
                .map(n -> {
                    System.out.println("map " + n);
                    return n.toUpperCase();
                });

        System.out.println("nada executou ainda");
        System.out.println(pipeline.limit(2).toList());
    }
}
```

A saída mostra `filter ana` (reprovado), `filter bruno`, `map bruno`, `filter carla`, `map carla` e para. `limit(2)` é uma operação de curto-circuito: assim que dois elementos passam, o pipeline é encerrado e `diego` nem é visitado. `anyMatch`, `findFirst` e `takeWhile` têm o mesmo comportamento.

Nem toda intermediária é stateless. `sorted`, `distinct`, `skip` e `limit` são **stateful**: precisam bufferizar ou coordenar elementos antes de emitir. `sorted` materializa tudo; `distinct` mantém um `HashSet` interno; `limit` em um stream paralelo ordenado precisa respeitar a ordem de encontro e pode perder paralelismo.

O `Collector` tem quatro funções e um conjunto de características:

| Função | Papel |
|---|---|
| `supplier` | cria o recipiente mutável |
| `accumulator` | insere um elemento no recipiente |
| `combiner` | une dois recipientes parciais |
| `finisher` | transforma o recipiente no resultado final |

Em sequential, o `combiner` normalmente não é chamado, mas ele precisa estar correto porque o mesmo collector pode rodar em paralelo. `Characteristics.CONCURRENT` só é seguro com `UNORDERED` e permite acumular no mesmo recipiente por várias threads; `IDENTITY_FINISH` diz que o `finisher` é a identidade.

## Na prática

`Collectors` cobre quase tudo: `groupingBy` com downstream, `partitioningBy`, `teeing` para calcular duas agregações em uma passada e `toUnmodifiableMap` para não expor o mapa. O problema clássico é `toMap` de dois argumentos: ele usa uma merge function que lança `IllegalStateException` ao encontrar chave duplicada. Use a sobrecarga com merge para decidir se vence o primeiro, o último ou se os valores devem ser somados.

```java
import java.util.List;
import java.util.stream.Collector;

public class ColetorDeResumo {
    record Resumo(long quantidade, long total, long maximo) {
        double media() { return quantidade == 0 ? 0 : (double) total / quantidade; }
    }

    static final Collector<Long, long[], Resumo> RESUMO = Collector.of(
            () -> new long[3],                       // quantidade, total, máximo
            (acc, valor) -> {
                acc[0]++;
                acc[1] += valor;
                acc[2] = Math.max(acc[2], valor);
            },
            (a, b) -> {                              // chamado em paralelo
                a[0] += b[0];
                a[1] += b[1];
                a[2] = Math.max(a[2], b[2]);
                return a;
            },
            acc -> new Resumo(acc[0], acc[1], acc[2]),
            Collector.Characteristics.UNORDERED
    );

    public static void main(String[] args) {
        List<Long> latencias = List.of(12L, 40L, 7L, 90L, 33L);
        Resumo r = latencias.parallelStream().collect(RESUMO);
        System.out.printf("n=%d max=%d media=%.1f%n", r.quantidade(), r.maximo(), r.media());
    }
}
```

O detalhe que quebra collectors caseiros é o `combiner`: ele recebe dois recipientes e deve devolver um. Devolver um novo array, mutar o primeiro ou ignorar o segundo são erros que só aparecem quando o pipeline é paralelo e o número de elementos justifica dividir o trabalho.

Para depuração, `peek` mostra o que passa em cada estágio, mas só enquanto a operação terminal realmente consumir aquele elemento; com curto-circuito, `peek` pode nunca ser chamado para o resto. E um `Stream` é de uso único: reutilizar lança `IllegalStateException: stream has already been operated upon or closed`.

## Armadilhas comuns

- **`toMap` sem merge.** Duplicata lança `IllegalStateException`. Além disso, `toMap` não aceita valor `null`: a implementação usa `Map.merge`, que lança `NullPointerException`.
- **`groupingBy` e ordem.** O mapa padrão é `HashMap`. Se a ordem importa, passe `TreeMap::new` ou `LinkedHashMap::new` como fábrica.
- **Collector customizado sem `combiner` correto.** Em sequential parece perfeito; em paralelo, perde ou duplica dados.
- **`Files.lines` e `BufferedReader.lines` sem `try-with-resources`.** O stream mantém o arquivo aberto; feche-o.
- **`flatMap` que engole exceções.** Uma lambda que captura e retorna `Stream.empty()` esconde falha de parsing e produz relatório incompleto.
- **`parallel()` por reflexo.** Adicionar paralelismo a um pipeline com `limit`, `sorted` ou I/O costuma piorar. Meça antes.

## Checklist de domínio

- [ ] Você explica por que nada executa antes da operação terminal
- [ ] Você identifica operações stateful e de curto-circuito
- [ ] Você escreve um `Collector` com `supplier`, `accumulator`, `combiner` e `finisher`
- [ ] Você corrige um `toMap` com merge function adequada
- [ ] Você reconhece um `Stream` reutilizado pelo erro em runtime

## Para ir além

- [Oracle — Collector](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collector.html)
- [Oracle — Collectors](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html)
- [Baeldung — Java 8 Streams](https://www.baeldung.com/java-8-streams)
