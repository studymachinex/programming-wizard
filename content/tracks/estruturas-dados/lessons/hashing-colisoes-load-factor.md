> **Em uma frase:** hashing troca ordenação por distribuição: uma função transforma a chave em um índice, e o desempenho depende de quão bem essa distribuição espalha as chaves.

## O problema

Você precisa descobrir se um CPF já foi processado, e fazer isso milhões de vezes por minuto. Guardar em uma lista e comparar um a um é O(n). Ordenar e usar busca binária é O(log n), mas inserir no meio de um array ordenado é caro. O hash map promete O(1) esperado: calcula um número a partir da chave, usa esse número como índice de um bucket e olha diretamente naquele balde.

A promessa tem letras miúdas. Se duas chaves caem no mesmo bucket, você precisa compará-las; se muitas caem no mesmo bucket, a busca vira linear. Se o `hashCode` for mal distribuído ou o objeto for mutável depois de inserido, o mapa "perde" a chave. Entender essas condições é o que diferencia usar `HashMap` de confiar cegamente nele.

## Como funciona

O caminho de uma chave até o bucket tem quatro etapas:

1. `key.hashCode()` produz um `int` (32 bits).
2. O HashMap espalha os bits altos para os baixos. A JDK usa `h ^ (h >>> 16)` para que capacidades pequenas (potências de dois) não ignorem a parte alta do hash.
3. O índice é `hash & (capacidade - 1)`. Isso só funciona porque a capacidade é potência de dois; é mais rápido que `%`.
4. Se duas chaves caem no mesmo índice, o HashMap encadeia nós. Desde o Java 8, uma cadeia longa pode virar uma árvore red-black (treeify) quando passa de 8 nós e a capacidade é pelo menos 64.

| Conceito | Valor típico | Efeito |
|---|---|---|
| Capacidade inicial | 16 | número de buckets |
| Load factor | 0,75 | resize quando `size > capacity * 0.75` |
| Treeify threshold | 8 | cadeia vira árvore |
| Untreeify | 6 | árvore volta a lista |
| Fator de crescimento | 2x | mantém potência de dois |

O código abaixo mostra o hash de strings, o espalhamento e o índice resultante. Rode com strings parecidas e veja como o espalhamento muda os bits baixos.

```java
public class Hashing {

    // Reimplementa o espalhamento usado pelo HashMap do Java.
    static int espalhar(int h) {
        return h ^ (h >>> 16);
    }

    static int indice(int hash, int capacidade) {
        return espalhar(hash) & (capacidade - 1);
    }

    public static void main(String[] args) {
        String[] chaves = {"user:1", "user:2", "user:3", "pedido:1", "pedido:2"};
        int capacidade = 16;
        for (String chave : chaves) {
            int h = chave.hashCode();
            System.out.printf("%-10s hash=%11d bucket=%2d%n",
                    chave, h, indice(h, capacidade));
        }

        // Colisão deliberada: strings diferentes, mesmo hashCode.
        System.out.println("Aa".hashCode()); // 2112
        System.out.println("BB".hashCode()); // 2112
    }
}
```

`"Aa"` e `"BB"` têm o mesmo `hashCode` por construction: os pesos dos caracteres se cancelam. Isso não é um bug; é uma colisão válida. O HashMap ainda distingue as duas porque compara com `equals` dentro do bucket. O que não pode acontecer é `equals` retornar `true` e `hashCode` ser diferente — aí a chave é inserida em um bucket e procurada em outro.

## Na prática

O contrato `equals`/`hashCode` é a fonte mais comum de bugs. O código abaixo mostra um objeto que sobrescreve `equals` mas esquece `hashCode`; o mapa aceita a chave, mas não a encontra.

```java
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public class Contrato {

    static final class PontoRuim {
        final int x, y;

        PontoRuim(int x, int y) {
            this.x = x;
            this.y = y;
        }

        @Override
        public boolean equals(Object o) {
            if (!(o instanceof PontoRuim p)) return false;
            return x == p.x && y == p.y;
        }
        // hashCode não sobrescrito: usa identidade, viola o contrato.
    }

    static final class PontoBom {
        final int x, y;

        PontoBom(int x, int y) {
            this.x = x;
            this.y = y;
        }

        @Override
        public boolean equals(Object o) {
            if (!(o instanceof PontoBom p)) return false;
            return x == p.x && y == p.y;
        }

        @Override
        public int hashCode() {
            return Objects.hash(x, y); // mesmo hash para pontos iguais
        }
    }

    public static void main(String[] args) {
        Map<PontoRuim, String> ruim = new HashMap<>();
        ruim.put(new PontoRuim(1, 2), "origem");
        System.out.println(ruim.get(new PontoRuim(1, 2))); // null

        Map<PontoBom, String> bom = new HashMap<>();
        bom.put(new PontoBom(1, 2), "origem");
        System.out.println(bom.get(new PontoBom(1, 2))); // origem
    }
}
```

O `PontoRuim` usa o `hashCode` de `Object`, que é baseado no endereço. Duas instâncias iguais caem em buckets diferentes; o `get` nem chega a comparar com `equals`. Em produção, isso aparece como "o cache não acerta nunca" ou "o set não remove duplicatas". A correção é sempre sobrescrever os dois juntos, preferencialmente com `Objects.hash` ou um `record` (que gera ambos).

Cuidado com chaves mutáveis: se um campo usado no `hashCode` muda depois do `put`, a chave fica no bucket antigo e não é encontrada. Use chaves imutáveis — `String`, `Integer`, `record` com campos `final`, ou uma cópia defensiva. Em sistemas expostos, também considere hash flooding: um atacante que gera muitas colisões pode transformar O(1) em O(n). A treeificação do Java 8 mitiga parte disso, mas não resolve tudo; limites de entrada e funções de hash com seed são defesas complementares.

## Armadilhas comuns

- **Sobrescrever `equals` sem `hashCode`.** O contrato quebra e o mapa perde chaves. Use `record` ou IDE para gerar os dois.
- **Usar objeto mutável como chave.** Mutar o campo usado no hash deixa a entrada inacessível. Prefira chaves imutáveis.
- **Achar que capacidade não importa.** `new HashMap<>(1_000_000)` aloca muitos buckets e desperdiça memória; deixe o mapa crescer ou estime pelo número esperado.
- **Confundir `HashMap` com `Hashtable`.** `Hashtable` é sincronizada e não aceita null; para concorrência, use `ConcurrentHashMap`.
- **Confiar em ordem de iteração.** `HashMap` não promete ordem; se precisa de ordem de inserção, use `LinkedHashMap`; se precisa ordenada por chave, `TreeMap`.

## Checklist de domínio

- [ ] Você explica o caminho hashCode → spread → índice → bucket
- [ ] Você implementa `equals` e `hashCode` consistentes
- [ ] Você sabe o que o load factor controla e por que 0,75 é o padrão
- [ ] Você reconhece colisões normais e ataques de hash flooding

## Para ir além

- [Oracle — HashMap (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html): contrato, load factor e notas de implementação.
- [OpenJDK — HashMap](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/HashMap.java): `hash`, `resize` e treeify no código real.
- [Baeldung — Java hashCode and equals](https://www.baeldung.com/java-equals-hashcode-contracts): exemplos e armadilhas do contrato.
