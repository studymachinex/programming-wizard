> **Em uma frase:** Big-O descreve como o custo cresce quando a entrada cresce; Theta e Omega dizem se esse limite é justo ou apenas uma das bordas.

## O problema

Você escreve uma função que funciona perfeitamente para 100 elementos e a coloca em produção. No primeiro mês, com 10 mil elementos, ela responde em 40 ms. No sexto, com 100 mil, passa de 4 segundos. O código não mudou; o tamanho da entrada mudou. Sem uma linguagem para descrever crescimento, você descobre o problema tarde, em produção, com o banco travado e o cliente reclamando.

Big-O é essa linguagem. Ele não mede milissegundos nem conta linhas de código: descreve a taxa de crescimento do número de operações em relação ao tamanho da entrada, ignorando constantes e termos menores. Isso é ao mesmo tempo o poder e a limitação da notação. Poder porque permite comparar `n log n` com `n²` sem saber se o servidor é um notebook ou um mainframe. Limitação porque `O(1)` não significa instantâneo e `O(n²)` pode ser mais rápido que `O(n log n)` para `n = 10`.

## Como funciona

Três letras, três ideias diferentes:

- **O(f(n))** é um limite superior: o custo cresce no máximo como f, a menos de constantes, para n suficientemente grande.
- **Ω(f(n))** é um limite inferior: o custo cresce pelo menos como f.
- **Θ(f(n))** é o limite justo: cresce como f por cima e por baixo.

Quando alguém diz "esse algoritmo é O(n²)", está dizendo que n² é um teto. Pode ser que o custo real seja n, e n também é O(n²) pela definição formal. Na prática, usamos O para dizer "no pior caso, cresce assim", mas os conceitos não são sinônimos de melhor/pior caso. Busca linear em um array tem melhor caso Ω(1) — o alvo está na primeira posição — e pior caso Θ(n). Busca binária tem pior caso Θ(log n).

As regras de análise são mecânicas:

1. **Descarte constantes.** 3n + 7 vira Θ(n).
2. **Mantenha o termo dominante.** n² + n log n + 100 vira Θ(n²).
3. **Loops aninhados multiplicam.** Um loop de n dentro de outro de n é n².
4. **Loops consecutivos somam.** n + n é 2n, que é Θ(n).
5. **Divisão por constante vira log.** Se o problema cai pela metade a cada passo, o número de passos é log₂ n.

O código abaixo instrumenta as operações para você ver a diferença entre Θ(n), Θ(n²) e Θ(log n). Contar operações é mais didático que cronometrar porque elimina o ruído do JIT e do sistema operacional.

```java
public class Analise {

    // Θ(n): percorre o array uma vez.
    public static long soma(int[] a) {
        long ops = 0;
        long total = 0;
        for (int i = 0; i < a.length; i++) {
            ops++;          // uma leitura por elemento
            total += a[i];
        }
        return ops;
    }

    // Θ(n²): para cada i, percorre de i até o fim.
    public static long pares(int[] a) {
        long ops = 0;
        long total = 0;
        for (int i = 0; i < a.length; i++) {
            for (int j = i + 1; j < a.length; j++) {
                ops++;
                total += (long) a[i] + a[j];
            }
        }
        return ops;
    }

    // Θ(log n): o intervalo cai pela metade a cada iteração.
    public static long buscaBinaria(int[] ordenado, int alvo) {
        long ops = 0;
        int lo = 0;
        int hi = ordenado.length - 1;
        while (lo <= hi) {
            ops++;
            int mid = lo + (hi - lo) / 2;
            if (ordenado[mid] == alvo) {
                return ops;
            }
            if (ordenado[mid] < alvo) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return ops;
    }

    public static void main(String[] args) {
        int n = 1_000;
        int[] crescente = new int[n];
        for (int i = 0; i < n; i++) {
            crescente[i] = i;
        }
        System.out.println("soma: " + soma(crescente));           // 1000
        System.out.println("pares: " + pares(crescente));         // 499500
        System.out.println("busca: " + buscaBinaria(crescente, -1)); // ~10
    }
}
```

Com `n = 1.000`, `pares` faz 499.500 iterações — metade de n². Se `n` dobra para 2.000, o número quadruplica para 1.999.000. A busca binária, para qualquer `n` até 1.024, faz no máximo 10 iterações. Essa é a diferença que importa: não o número absoluto, mas como ele reage ao crescimento.

## Na prática

Uma confusão comum é achar que dois algoritmos com a mesma notação têm o mesmo desempenho. `Arrays.sort(int[])` é O(n log n), mas usa quicksort dual-pivot com acesso sequencial; uma árvore binária de busca também é O(n log n) para inserir n elementos, mas cada operação salta entre objetos no heap. Para 10 milhões de inteiros, a diferença é de uma ordem de magnitude, não de uma constante irrelevante.

```java
import java.util.ArrayList;
import java.util.List;

public class CustoReal {

    // Soma em array primitivo: acessos contíguos, sem boxing.
    public static long somaPrimitivos(int[] a) {
        long total = 0;
        for (int x : a) {
            total += x;
        }
        return total;
    }

    // Mesma complexidade assintótica, mas com desreferência de objetos.
    public static long somaObjetos(List<Integer> a) {
        long total = 0;
        for (int x : a) { // unboxing a cada iteração
            total += x;
        }
        return total;
    }

    public static void main(String[] args) {
        int n = 5_000_000;
        int[] primos = new int[n];
        List<Integer> objetos = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            primos[i] = i;
            objetos.add(i);
        }

        long t0 = System.nanoTime();
        long s1 = somaPrimitivos(primos);
        long t1 = System.nanoTime();
        long s2 = somaObjetos(objetos);
        long t2 = System.nanoTime();

        System.out.printf("%d em %d ms%n", s1, (t1 - t0) / 1_000_000);
        System.out.printf("%d em %d ms%n", s2, (t2 - t1) / 1_000_000);
    }
}
```

Em uma JVM típica, `somaObjetos` é várias vezes mais lenta. Ambas são Θ(n). O que mudou foi a constante: um `Integer` é um objeto com cabeçalho, a lista guarda referências e o unboxing cria trabalho extra. Big-O continua correto; sua intuição de "mesma complexidade, mesmo tempo" é que estava errada.

Por isso a análise séria combina três camadas: complexidade assintótica para descartar algoritmos inviáveis, constantes e localidade para escolher entre os viáveis, e medição com cargas realistas para confirmar. Se você pular a primeira, escolhe errado para `n` grande. Se pular as outras duas, escolhe errado para `n` pequeno e para o hardware real.

## Armadilhas comuns

- **Achar que O(1) é sempre mais rápido.** Hashing tem custo de função, colisão e indireção; para 8 elementos, uma busca linear pode ganhar.
- **Somar complexidades de loops aninhados em vez de multiplicar.** O loop interno que roda `n` vezes para cada `i` é produto, não soma.
- **Esquecer o custo das operações da biblioteca.** `list.add(0, x)` é O(n); `subList` é uma view O(1), mas `new ArrayList<>(subList)` é O(n).
- **Chamar de O(n) o que é O(n log n) por causa de uma ordenação escondida.** `Stream.sorted()` no meio do pipeline custa O(n log n).
- **Ignorar o espaço.** Um algoritmo O(n) de tempo pode ser O(n) de memória; em um serviço com 200 MB de heap, isso derruba o pod.

## Checklist de domínio

- [ ] Você classifica um método com loops aninhados e dependentes sem contar linhas
- [ ] Você explica a diferença entre O, Θ e Ω com um exemplo de busca
- [ ] Você reconhece quando uma constante grande inverte a ordem prática
- [ ] Você sabe por que `ArrayList<Integer>` e `int[]` não são intercambiáveis em performance

## Para ir além

- [Big-O Cheat Sheet](https://www.bigocheatsheet.com/): tabela de custos por estrutura e algoritmo.
- [MIT 6.006 — Lecture 1: Algorithmic Thinking](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/): definições formais e exemplos.
- [Java Collections — Complexidade](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/doc-files/coll-index.html): referência oficial das implementações da JDK.
