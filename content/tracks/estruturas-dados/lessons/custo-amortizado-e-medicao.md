> **Em uma frase:** custo amortizado é a média de uma sequência de operações — uma operação cara ocasional pode ser barata no total se ela financiar muitas operações baratas.

## O problema

Você lê que `ArrayList.add` é O(1) e usa isso para justificar um loop que insere um milhão de itens. Em algum momento, o array interno enche, a JDK aloca um novo array maior e copia todos os elementos. Essa cópia é O(n). Se o add fosse sempre O(1), a cópia não existiria; se a cópia fosse sempre O(n), o loop seria O(n²). A verdade está no meio, e o nome disso é custo amortizado.

O conceito importa além de `ArrayList`: `StringBuilder.append`, `HashMap.put` durante resize, `PriorityQueue.offer`, `ArrayDeque.add` e a expansão de buffers de rede. Entender amortizado evita duas conclusões erradas: "a operação cara não existe" e "o loop é quadrático". Também evita a armadilha oposta, de micro-otimizar a cópia quando o gargalo real está em outro lugar.

## Como funciona

Existem três formas equivalentes de provar custo amortizado. A mais intuitiva é o **método agregado**: some o custo de uma sequência de n operações e divida por n. Para um dynamic array que dobra de capacidade, as cópias ocorrem nos tamanhos 1, 2, 4, 8, ..., n/2. O total de elementos copiados é:

`1 + 2 + 4 + ... + n/2 < n`

Somando as n inserções (cada uma escreve um elemento) e as menos de n cópias, o total é menor que 2n. Dividindo por n, o custo médio por inserção é menor que 2: O(1) amortizado. O pior caso de uma inserção isolada continua O(n), mas a sequência inteira é linear.

A segunda é o **método contábil**: cada inserção barata paga 2 créditos, um para si e um para financiar a futura cópia do elemento. Quando a cópia chega, o crédito acumulado paga. A terceira é o **método do potencial**, mais formal, usado em análise de algoritmos competitivos.

O código abaixo simula o crescimento e conta as cópias. Rode com `n = 1_000_000` e compare o total de cópias com n.

```java
import java.util.Arrays;

public class Crescimento {

    static final class IntArray {
        private int[] dados = new int[1];
        private int tamanho;
        long copias;

        void add(int valor) {
            if (tamanho == dados.length) {
                int novaCapacidade = dados.length * 2;
                dados = Arrays.copyOf(dados, novaCapacidade);
                copias += tamanho; // todos os elementos existentes são copiados
            }
            dados[tamanho++] = valor;
        }

        int get(int i) {
            if (i < 0 || i >= tamanho) {
                throw new IndexOutOfBoundsException("índice " + i + " de " + tamanho);
            }
            return dados[i];
        }
    }

    public static void main(String[] args) {
        int n = 1_000_000;
        IntArray a = new IntArray();
        for (int i = 0; i < n; i++) {
            a.add(i);
        }
        System.out.println("elementos: " + n);
        System.out.println("cópias: " + a.copias);      // ~1.048.575, pouco mais que n
        System.out.println("razão: " + (double) a.copias / n); // ~1,05
    }
}
```

A razão fica perto de 1, não de n. Se você trocar o crescimento por `+1`, a razão explode para ~n/2 e o loop vira quadrático. Essa é a diferença entre `ArrayList` e uma implementação ingênua: a política de crescimento é o algoritmo.

Agora o custo escondido. Amortizado não significa gratuito. `HashMap.put` é O(1) amortizado, mas cada put pode calcular `hashCode`, comparar chaves com `equals`, alocar um nó e, ocasionalmente, rehashar todos os buckets. Em uma `String` longa, o primeiro `hashCode` é O(tamanho) e fica cacheado no objeto; em uma chave composta com 50 campos, o `equals` pode comparar 50 valores. O O(1) é uma promessa sobre o número de buckets, não sobre o custo de comparar a chave.

## Na prática

O exemplo mais comum de custo escondido é concatenar strings em loop. `s += item` cria uma nova `String` a cada iteração, copiando todo o conteúdo anterior. O resultado é O(n²) em caracteres, mesmo que o loop tenha apenas n iterações. `StringBuilder` mantém um buffer que cresce amortizado e transforma o custo em O(n). O código a seguir mostra a diferença de tempo e serve como medidor honesto, com warmup e repetições.

```java
public class Concatena {

    static String comString(int n) {
        String s = "";
        for (int i = 0; i < n; i++) {
            s += i % 10; // nova String a cada iteração
        }
        return s;
    }

    static String comBuilder(int n) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) {
            sb.append(i % 10);
        }
        return sb.toString();
    }

    // Aquece o JIT antes de medir, repete e usa o menor tempo.
    static long medir(Runnable r, int repeticoes) {
        long melhor = Long.MAX_VALUE;
        for (int i = 0; i < repeticoes; i++) {
            long t0 = System.nanoTime();
            r.run();
            long t1 = System.nanoTime();
            melhor = Math.min(melhor, t1 - t0);
        }
        return melhor;
    }

    public static void main(String[] args) {
        int n = 20_000;
        medir(() -> comBuilder(n), 3); // warmup
        long lento = medir(() -> comString(n), 5);
        long rapido = medir(() -> comBuilder(n), 5);
        System.out.printf("String: %d ms%n", lento / 1_000_000);
        System.out.printf("Builder: %d ms%n", rapido / 1_000_000);
    }
}
```

Em `n = 20.000`, a versão com `String` costuma ser dezenas de vezes mais lenta. A complexidade não está no `for`; está na alocação e cópia dentro do operador `+=`. É exatamente o tipo de custo que um benchmark ingênuo, sem warmup, esconde ou exagera.

Para medir de verdade, use JMH (Java Microbenchmark Harness) quando a decisão for importante. JMH controla warmup, fork, dead-code elimination e estatística. `System.nanoTime` serve para uma primeira exploração, mas não para concluir que uma diferença de 5% é real. E lembre-se: medir a operação isolada pode não refletir o uso real, onde o cache está quente ou o GC acabou de rodar.

## Armadilhas comuns

- **Confundir amortizado com pior caso.** Uma única inserção pode ser O(n); o que é O(1) é a média da sequência. Em sistemas de tempo real, o pior caso ainda importa.
- **Achar que `ArrayList` cresce 2x.** A JDK usa `oldCapacity + (oldCapacity >> 1)`, ou seja, ~1,5x. Ainda é amortizado O(1), mas com mais resizes que a dobra.
- **Esquecer o custo de `hashCode` e `equals`.** Uma chave composta com 50 campos torna o put O(50), não O(1) no sentido prático.
- **Medir uma vez e concluir.** O JIT interpreta nas primeiras execuções; sem warmup, você mede o interpretador, não o código compilado.
- **Otimizar a cópia e ignorar o GC.** Em cargas grandes, o custo de alocação e coleta pode dominar o custo de cópia.

## Para ir além

- [OpenJDK — ArrayList](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/ArrayList.java): veja `grow()` e a política de 1,5x no código real.
- [JMH — Java Microbenchmark Harness](https://openjdk.org/projects/code-tools/jmh/): ferramenta oficial para benchmarks confiáveis.
- [MIT 6.006 — Amortized Analysis](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/): aulas sobre análise agregada e potencial.
