> **Em uma frase:** `HashSet` garante unicidade usando `hashCode` para achar o bucket e `equals` para desempatar; se os dois não forem coerentes, o conjunto passa a mentir.

## O problema

Um sistema de campanhas carregava e-mails de um CSV e usava `HashSet<String>` para remover duplicados. Funcionava. Quando passou a deduplicar por `Cliente`, o conjunto aceitou o mesmo cliente duas vezes. A classe `Cliente` não sobrescrevia `equals` nem `hashCode`, então cada instância era única para o `HashSet` — mesmo com CPF idêntico.

O contrato de igualdade é a base não só de `Set`, mas de `Map`, de caching e de qualquer comparação de valores. Ele é fácil de declarar e fácil de violar de formas que só aparecem em produção, com dados reais.

## Como funciona

`Set` é uma coleção sem duplicatas e sem índice. `HashSet` é implementado sobre um `HashMap`: cada elemento é uma chave, e o valor é um objeto sentinela. A tabela tem capacidade inicial 16 e fator de carga 0,75; ao passar de 12 elementos, dobra para 32. Cada bucket pode ser uma lista encadeada que, a partir de 8 colisões, vira uma árvore balanceada (desde Java 8).

O fluxo de `add` é: calcular `hashCode`, espalhar os bits, achar o bucket, comparar com `equals` os elementos daquele bucket. Se nenhum for igual, insere. Média O(1), pior caso O(log n) com treeificação.

```java
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public class Clientes {
    static final class Cliente {
        private final String cpf;
        private final String nome;

        Cliente(String cpf, String nome) {
            this.cpf = Objects.requireNonNull(cpf);
            this.nome = Objects.requireNonNull(nome);
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Cliente outro)) return false;
            return cpf.equals(outro.cpf);
        }

        @Override
        public int hashCode() {
            return Objects.hash(cpf);
        }

        @Override
        public String toString() {
            return nome + " (" + cpf + ")";
        }
    }

    public static void main(String[] args) {
        Set<Cliente> clientes = new HashSet<>();
        clientes.add(new Cliente("12345678901", "Ana"));
        clientes.add(new Cliente("12345678901", "Ana Maria"));
        System.out.println(clientes.size()); // 1
        System.out.println(clientes);        // [Ana (12345678901)]
    }
}
```

O primeiro objeto inserido permanece; o segundo é considerado duplicado e não altera o conjunto. Se você quer o nome mais recente, precisa remover e reinserir, ou usar um `Map<String, Cliente>` indexado por CPF.

## Na prática

Há três implementações principais. `HashSet` não garante ordem. `LinkedHashSet` mantém a ordem de inserção com uma lista ligada adicional. `TreeSet` mantém os elementos ordenados por `Comparable` ou `Comparator`, com operações O(log n).

```java
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public class TiposDeSet {
    public static void main(String[] args) {
        List<String> tags = List.of("java", "jvm", "java", "streams", "jvm");

        Set<String> semOrdem = new java.util.HashSet<>(tags);
        Set<String> insercao = new LinkedHashSet<>(tags);
        Set<String> ordenado = new TreeSet<>(tags);

        System.out.println(semOrdem);  // ordem não garantida
        System.out.println(insercao);  // [java, jvm, streams]
        System.out.println(ordenado);  // [java, jvm, streams] alfabético
    }
}
```

`EnumSet` é a escolha para conjuntos de constantes de enum: é representado por bits e costuma ser bem mais econômico que `HashSet`. `Set.of(...)` cria um conjunto imutável, sem ordem garantida e sem aceitar duplicatas na criação — `Set.of("a", "a")` lança `IllegalArgumentException`.

O ponto crítico é que a chave de hash precisa ser estável. Se você insere um objeto em `HashSet`, depois altera um campo usado no `hashCode`, o objeto continua no bucket antigo, mas futuras buscas vão para o bucket novo. O resultado é um "fantasma": o elemento está lá, mas `contains` retorna `false` e `remove` não o encontra.

## Armadilhas comuns

- **Sobrescrever `equals` sem `hashCode`.** O `HashSet` pode conter duplicatas lógicas. Sempre sobrescreva os dois juntos.
- **Usar campo mutável no hash.** O objeto "desaparece" do conjunto após a alteração. Prefira chaves imutáveis ou remova antes de mutar.
- **Depender da ordem de `HashSet`.** A iteração pode mudar entre execuções e versões da JVM. Use `LinkedHashSet` ou `TreeSet` se a ordem importa.
- **Comparar classes diferentes com `instanceof` de forma assimétrica.** Se `A.equals(B)` é true e `B.equals(A)` não, o contrato está quebrado. Considere `getClass()` ou restrinja a hierarquia.

## Checklist de domínio

- [ ] Você explica o caminho `hashCode` -> bucket -> `equals` em um `HashSet`
- [ ] Você implementa `equals`/`hashCode` coerentes e testa com duplicatas
- [ ] Você escolhe entre `HashSet`, `LinkedHashSet`, `TreeSet` e `EnumSet`
- [ ] Você entende por que chaves mutáveis quebram conjuntos e mapas

## Para ir além

- [Java SE 21 API — HashSet](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashSet.html): contrato e comportamento.
- [Baeldung — Java equals() and hashCode() Contracts](https://www.baeldung.com/java-equals-hashcode-contracts): os requisitos e como testá-los.
- [dev.java — The Collections Framework](https://dev.java/learn/collections/): quando usar cada tipo de conjunto.
