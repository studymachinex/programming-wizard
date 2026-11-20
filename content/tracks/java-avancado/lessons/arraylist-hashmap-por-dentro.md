> **Em uma frase:** ArrayList e HashMap escondem decisões de capacidade, cópia e hashing que explicam a maior parte do custo real — e das surpresas — de collections em produção.

## O problema

Um endpoint monta uma lista com 200 mil pedidos por requisição e "só" perde 300 ms. Outro serviço guarda 1,5 milhão de chaves em um `HashMap` e vê o p99 dobrar depois de um deploy que apenas adicionou um campo ao DTO. Em ambos os casos, a complexidade assintótica diz O(1) ou O(n), mas o tempo real é dominado por cópias de array, alocação, colisões e redimensionamentos.

A pergunta útil não é "qual é a complexidade?", e sim "quantas vezes essa estrutura copiou, realocou ou recalculou hash nesta requisição?".

## Como funciona

Um `ArrayList` é um `Object[]` com um tamanho lógico separado. O construtor vazio usa um array compartilhado; o primeiro `add` cria um array de capacidade 10. Quando enche, `grow()` calcula `oldCapacity + (oldCapacity >> 1)` — crescimento de 1,5x — e chama `Arrays.copyOf`, que aloca outro array e copia todas as referências. A sequência é 10, 15, 22, 33, 49, 73... Cada crescimento é O(n), mas o custo total é amortizado O(1). O problema é a conta escondida: até 1 milhão de elementos, o JDK copia cerca de 2,4 milhões de referências e descarta 29 arrays intermediários.

```java
public class CrescimentoDoArrayList {
    public static void main(String[] args) {
        int capacidade = 10; // criada no primeiro add
        int alvo = 1_000_000;
        long referenciasCopiadas = 0;
        int redimensionamentos = 0;

        while (capacidade < alvo) {
            referenciasCopiadas += capacidade;              // Arrays.copyOf copia tudo
            capacidade = capacidade + (capacidade >> 1);    // 1,5x
            redimensionamentos++;
        }

        System.out.printf("capacidade=%d, resizes=%d, copias=%d%n",
                capacidade, redimensionamentos, referenciasCopiadas);
    }
}
```

O `HashMap` é um array de buckets (`Node<K,V>[] table`) cujo tamanho é sempre potência de 2. O índice é `(n - 1) & hash`, barato porque substitui o módulo. Antes disso, o JDK espalha os bits altos para os baixos (`h ^= h >>> 16`), porque senão hashes com variação só no topo colidiriam nos mesmos buckets. A capacidade inicial padrão é 16, com load factor 0,75: o threshold é 12 e a 13ª inserção dispara resize para 32.

No resize, cada bucket é dividido em duas listas, `lo` e `hi`, conforme o bit extra do hash, preservando a ordem relativa. Desde o Java 8, uma lista com 8 ou mais nós e tabela com pelo menos 64 posições vira uma árvore vermelho-preto; abaixo disso, o resize é preferível. A árvore limita o pior caso a O(log n), mas cada `TreeNode` custa bem mais que um `Node` (na casa de 48–56 bytes contra ~32). Com 1 milhão de entradas, a tabela chega a 2.097.152 posições (≈8 MB só de referências) e os nós somam outras várias dezenas de MB.

## Na prática

Pré-dimensione quando o tamanho é conhecido: `new ArrayList<>(200_000)` elimina os 29 resizes. Para mapas, a conta é `capacidadeEsperada / 0,75 + 1`, lembrando que o JDK arredonda para a próxima potência de 2 — pedir 1.000.000 resulta em tabela de 2.097.152. Em troca, você paga memória adiantada; não presize com um número vindo do cliente sem validar o limite.

Use tipos de chave imutáveis. `record`, `String`, `Integer` e `UUID` funcionam; um DTO mutável é uma bomba-relógio. O `hashCode` é calculado na inserção, e o bucket escolhido não é recalculado depois. Se um campo usado no hash mudar, a entrada continua no mapa, mas fica inalcançável.

```java
import java.util.HashMap;
import java.util.Map;

public class ChaveMutavel {
    static final class Pedido {
        String id;

        Pedido(String id) { this.id = id; }

        @Override public boolean equals(Object o) {
            return o instanceof Pedido p && id.equals(p.id);
        }

        @Override public int hashCode() { return id.hashCode(); }
    }

    public static void main(String[] args) {
        Map<Pedido, String> status = new HashMap<>();
        Pedido pedido = new Pedido("A-1");
        status.put(pedido, "aprovado");

        pedido.id = "A-2"; // mudou o hash depois da inserção
        System.out.println(status.get(pedido));          // null
        System.out.println(status.containsValue("aprovado")); // true
    }
}
```

Para 1 milhão de inteiros, um `ArrayList<Integer>` guarda 4 MB de referências (com compressed oops) mais cerca de 16 bytes por `Integer` — perto de 20 MB. Um `int[]` resolve em 4 MB e ainda ganha localidade de cache. Já um `HashMap` com 1 milhão de entradas dificilmente fica abaixo de 40–50 MB.

## Armadilhas comuns

- **Chave mutável em `HashMap`.** A entrada fica no bucket antigo e vira lixo lógico até o próximo resize. Prefira chaves imutáveis e nunca exponha setters usados no `equals`.
- **`hashCode` constante ou ruim.** Tudo cai no mesmo bucket: vira lista O(n) até 8 nós, depois árvore O(log n). O sintoma é CPU alta em `HashMap.get`, não erro.
- **`remove(int)` versus `remove(Object)`.** Em `List<Integer>`, `remove(1)` remove o índice 1; `remove(Integer.valueOf(1))` remove o valor.
- **Capacidade inicial mal calculada.** `new HashMap<>(16)` continua com threshold 12. Para 16 entradas, use 32 ou aceite um resize.
- **`List.of` e `Arrays.asList` não são `ArrayList`.** O primeiro é imutável; o segundo tem tamanho fixo e aceita `set`, mas não `add`.
- **`HashMap` não é thread-safe.** Mesmo leituras concorrentes durante um resize podem observar estado inconsistente. Para concorrência, use `ConcurrentHashMap`, e não `Collections.synchronizedMap` sem sincronizar a iteração.

## Checklist de domínio

- [ ] Você calcula a sequência de capacidades do `ArrayList` sem consultar
- [ ] Você explica quando o `HashMap` treeifica e quando apenas redimensiona
- [ ] Você dimensiona `ArrayList` e `HashMap` para um volume conhecido
- [ ] Você reconhece uma chave mutável que "desapareceu" do mapa
- [ ] Você escolhe entre `int[]`, `List<Integer>` e `Map` considerando memória, não só API

## Para ir além

- [Oracle — ArrayList](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayList.html)
- [Oracle — HashMap](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html)
- [OpenJDK — código-fonte do HashMap](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/HashMap.java)
- [Baeldung — Java ArrayList](https://www.baeldung.com/java-arraylist)
