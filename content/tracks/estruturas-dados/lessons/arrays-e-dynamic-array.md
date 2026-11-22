> **Em uma frase:** o array é a estrutura mais próxima da memória; entender seu layout explica por que ele é imbatível em acesso e por que inserir no meio é caro.

## O problema

Você precisa guardar uma sequência de temperaturas lidas de um sensor, mas não sabe quantas leituras virão. Um `int[1000]` fixo desperdiça memória se vierem 10 e quebra se vierem 1001. Um `ArrayList<Integer>` resolve o tamanho, mas guarda objetos e perde localidade. A solução real é um **dynamic array**: um array contíguo com um contador de tamanho e uma política de crescimento.

Quase toda linguagem tem essa estrutura com nomes diferentes: `ArrayList` em Java, `Vec` em Rust, `List` em C#, `slice` em Go. Entender como ela funciona por dentro explica o custo de `add`, o motivo de `remove(0)` ser O(n) e por que `ArrayList` pode ser mais rápida que `LinkedList` mesmo em inserções no meio, quando o volume é pequeno.

## Como funciona

Um array Java é um bloco contíguo de memória com um cabeçalho (classe, tamanho) seguido dos elementos. O acesso a `a[i]` é calculado como `base + i * tamanhoDoElemento`, em tempo constante. Não há busca: o índice é aritmética de ponteiro. Em um `int[]`, cada elemento ocupa 4 bytes; um array de 1.000 inteiros ocupa ~4 KB e cabe inteiro no cache L1 de um núcleo moderno.

O dynamic array adiciona dois campos: `dados` (o buffer) e `tamanho` (quantos slots são válidos). A capacidade pode ser maior que o tamanho; os slots entre `tamanho` e `capacidade` são lixo. As operações são:

| Operação | Custo | Por quê |
|---|---|---|
| `get(i)` / `set(i, x)` | O(1) | aritmética de índice |
| `add(x)` no fim | O(1) amortizado | ocasionalmente copia tudo |
| `add(i, x)` no meio | O(n) | desloca n-i elementos |
| `remove(i)` | O(n) | desloca n-i-1 elementos |
| `contains(x)` | O(n) | varredura linear |

O código abaixo implementa o núcleo sem usar `ArrayList`, com validação de índices e crescimento por dobra. Ele é a base do exercício `dsa-dynamic-array`.

```java
import java.util.Arrays;

public class IntDynamicArray {
    private int[] dados;
    private int tamanho;

    public IntDynamicArray() {
        this(8);
    }

    public IntDynamicArray(int capacidadeInicial) {
        if (capacidadeInicial < 1) {
            throw new IllegalArgumentException("capacidade deve ser >= 1");
        }
        this.dados = new int[capacidadeInicial];
    }

    public int size() {
        return tamanho;
    }

    public boolean isEmpty() {
        return tamanho == 0;
    }

    public int get(int i) {
        checarIndice(i);
        return dados[i];
    }

    public void set(int i, int valor) {
        checarIndice(i);
        dados[i] = valor;
    }

    public void add(int valor) {
        garantirCapacidade(tamanho + 1);
        dados[tamanho++] = valor;
    }

    public void add(int i, int valor) {
        if (i < 0 || i > tamanho) {
            throw new IndexOutOfBoundsException("índice " + i + " de " + tamanho);
        }
        garantirCapacidade(tamanho + 1);
        // move [i, tamanho) uma posição para a direita
        System.arraycopy(dados, i, dados, i + 1, tamanho - i);
        dados[i] = valor;
        tamanho++;
    }

    public int remove(int i) {
        checarIndice(i);
        int removido = dados[i];
        int movidos = tamanho - i - 1;
        if (movidos > 0) {
            System.arraycopy(dados, i + 1, dados, i, movidos);
        }
        tamanho--;
        dados[tamanho] = 0; // evita referência fantasma em arrays de objetos
        return removido;
    }

    private void garantirCapacidade(int necessaria) {
        if (necessaria <= dados.length) {
            return;
        }
        int nova = Math.max(dados.length * 2, necessaria);
        dados = Arrays.copyOf(dados, nova);
    }

    private void checarIndice(int i) {
        if (i < 0 || i >= tamanho) {
            throw new IndexOutOfBoundsException("índice " + i + " de " + tamanho);
        }
    }
}
```

Repare em três decisões. Primeiro, `add(i, x)` aceita `i == tamanho` (inserir no fim) e usa `System.arraycopy`, que é implementado em código nativo e costuma ser mais rápido que um loop Java. Segundo, `remove` zera o slot removido; em um array de objetos, isso evita que o GC mantenha vivo um objeto que já saiu da lista. Terceiro, o crescimento dobra a capacidade ou usa o necessário, o que for maior — se você pedir `add` em um array vazio com capacidade 1, a próxima capacidade não pode ser 0.

## Na prática

O padrão de uso importa tanto quanto a implementação. Inserir no fim é barato; inserir no início repetidamente é O(n²), porque cada inserção desloca todo o array. Se o seu caso de uso é uma fila, um `ArrayDeque` ou uma fila circular é a estrutura correta; se é um histórico com inserções no meio, uma lista ligada ou uma árvore pode ser melhor. O código abaixo compara o custo de percorrer uma matriz por linhas e por colunas, mostrando o efeito de localidade:

```java
public class Matriz {

    // Percorre linha a linha: acessos contíguos na memória.
    static long somaPorLinha(int[][] m) {
        long total = 0;
        for (int i = 0; i < m.length; i++) {
            for (int j = 0; j < m[i].length; j++) {
                total += m[i][j];
            }
        }
        return total;
    }

    // Percorre coluna a coluna: salta de linha em linha a cada acesso.
    static long somaPorColuna(int[][] m) {
        long total = 0;
        for (int j = 0; j < m[0].length; j++) {
            for (int i = 0; i < m.length; i++) {
                total += m[i][j];
            }
        }
        return total;
    }

    public static void main(String[] args) {
        int n = 4_000;
        int[][] m = new int[n][n];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                m[i][j] = i + j;
            }
        }

        long t0 = System.nanoTime();
        long a = somaPorLinha(m);
        long t1 = System.nanoTime();
        long b = somaPorColuna(m);
        long t2 = System.nanoTime();

        System.out.println(a == b); // true
        System.out.printf("linha: %d ms, coluna: %d ms%n",
                (t1 - t0) / 1_000_000, (t2 - t1) / 1_000_000);
    }
}
```

As duas somas são O(n²), mas a versão por coluna costuma ser bem mais lenta porque cada acesso pula 4.000 inteiros (16 KB), estourando a linha de cache. É o mesmo motivo pelo qual uma `LinkedList` perde para uma `ArrayList` em iteração sequencial: o array entrega ao processador exatamente o que ele sabe prefetchar.

Em Java, `ArrayList` usa um `Object[]` e, portanto, guarda referências. Para milhões de inteiros, `int[]` ou uma biblioteca de primitivos (Eclipse Collections, fastutil) evita o boxing e reduz o consumo de memória de ~16 bytes por `Integer` para 4 bytes por `int`. A decisão não é prematura se o volume justifica: em um serviço de telemetria com 50 milhões de amostras, a diferença é de gigabytes.

## Armadilhas comuns

- **Encolher a cada remoção.** Se você reduz a capacidade quando `tamanho < capacidade/2`, uma sequência de add/remove alternada causa resize a cada operação. Encolha só abaixo de 1/4.
- **Esquecer de zerar slots removidos.** Em arrays de objetos, a referência antiga mantém o objeto vivo e vaza memória.
- **Usar `add(0, x)` em loop.** Cada chamada desloca n elementos; o loop é O(n²). Use `ArrayDeque` ou insira no fim e inverta no final.
- **Confundir tamanho com capacidade.** `size()` é quantos elementos existem; `dados.length` é o buffer. Expor capacidade na API raramente é necessário.
- **Ignorar o custo de cópia em arrays grandes.** `Arrays.copyOf` de 100 milhões de inteiros copia 400 MB; isso aparece no perfil como pausa, não como CPU.

## Para ir além

- [OpenJDK — ArrayList](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/ArrayList.java): implementação real, com `grow` e `System.arraycopy`.
- [Oracle — Arrays (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html): documentação de `copyOf`, `fill` e `sort`.
- [Visualgo — Array](https://visualgo.net/en/array): visualização de inserção, remoção e deslocamento.
