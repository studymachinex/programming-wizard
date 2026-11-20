> **Em uma frase:** Array é um objeto de tamanho fixo com índices de 0 a `length - 1`; o for-each lê valores, mas não substitui a escrita indexada quando você precisa alterar posições.

## O problema

Um sistema de notas guardava as médias em um array e exibia a média da turma. O cálculo usava `for (int i = 0; i <= notas.length; i++)`, e o programa quebrava sempre que havia pelo menos uma nota — ou seja, sempre. O `ArrayIndexOutOfBoundsException` estava na linha do laço, mas a causa era o operador `<=`.

Arrays são a estrutura mais antiga e mais rápida do Java. Entender o modelo de memória por trás deles explica desde o custo de uma cópia até o motivo de uma alteração em um método aparecer no chamador.

## Como funciona

`int[] notas = new int[4]` cria um objeto no heap com quatro posições contíguas de 32 bits, inicializadas com zero. Referências começam com `null`, `boolean` com `false` e `char` com `'\u0000'`. O campo `length` é público, final e não é um método: `notas.length`, nunca `notas.length()`.

O índice é validado em runtime. Acessar `-1` ou `length` lança `ArrayIndexOutOfBoundsException`. Diferente de C, não há leitura de memória adjacente.

```java
import java.util.Arrays;

public class Notas {
    public static void main(String[] args) {
        int[] notas = {7, 9, 5, 10};
        int soma = 0;
        int maior = notas[0];

        for (int i = 0; i < notas.length; i++) {
            soma += notas[i];
            if (notas[i] > maior) maior = notas[i];
        }

        double media = (double) soma / notas.length;
        System.out.printf("Média: %.2f | Maior: %d%n", media, maior); // 7.75 | 10

        Arrays.sort(notas);
        System.out.println(Arrays.toString(notas)); // [5, 7, 9, 10]
    }
}
```

O for-each (`for (int nota : notas)`) é mais legível quando você só lê. Ele funciona com arrays e com qualquer `Iterable`. Por baixo, o compilador transforma o array em um laço indexado; para coleções, usa um `Iterator`.

O ponto que pega muita gente: a variável do for-each é uma **cópia** do elemento. Em um array de primitivos, atribuir a ela não altera o array. Em um array de objetos, você pode chamar métodos que mudam o objeto, mas não pode trocar a referência da posição.

```java
public class ForEach {
    static class Conta {
        int saldo;
        Conta(int saldo) { this.saldo = saldo; }
    }

    public static void main(String[] args) {
        int[] numeros = {1, 2, 3};
        for (int n : numeros) {
            n = n * 10; // altera só a cópia local
        }
        System.out.println(java.util.Arrays.toString(numeros)); // [1, 2, 3]

        Conta[] contas = {new Conta(100), new Conta(200)};
        for (Conta c : contas) {
            c.saldo += 50; // altera o objeto apontado
        }
        System.out.println(contas[0].saldo); // 150

        for (Conta c : contas) {
            c = new Conta(0); // troca só a referência local
        }
        System.out.println(contas[0].saldo); // 150
    }
}
```

## Na prática

Matrizes em Java são arrays de arrays. `int[][] m = new int[3][4]` cria três referências para arrays de quatro inteiros. As linhas podem ter tamanhos diferentes — arrays "jagged" — e você precisa usar `m[i].length`, não `m.length`, ao percorrer colunas.

```java
public class Matriz {
    public static void main(String[] args) {
        int[][] m = {
            {1, 2, 3},
            {4, 5, 6},
            {7, 8, 9}
        };

        int diagonal = 0;
        for (int i = 0; i < m.length; i++) {
            diagonal += m[i][i];
        }
        System.out.println("Diagonal: " + diagonal); // 15

        int[][] irregular = new int[3][];
        irregular[0] = new int[]{1};
        irregular[1] = new int[]{2, 3};
        irregular[2] = new int[]{4, 5, 6};

        for (int[] linha : irregular) {
            System.out.println(linha.length); // 1, 2, 3
        }
    }
}
```

Copiar array exige decisão. `b = a` copia a referência: os dois nomes apontam para o mesmo objeto. `Arrays.copyOf(a, a.length)` cria um novo array com os valores copiados — cópia rasa, suficiente para primitivos. `a.clone()` também funciona, mas `copyOf` deixa a intenção explícita. Para copiar parte, `System.arraycopy(origem, inicio, destino, inicioDestino, quantidade)`.

Arrays têm tamanho fixo. Se você precisa crescer, usa `ArrayList`; se precisa de um contrato imutável, `List.of`. Em APIs públicas, expor um array interno é vazamento de estado: o chamador pode alterar posições. Devolva uma cópia ou uma lista imutável.

## Armadilhas comuns

- **Usar `==` para comparar conteúdo.** `a == b` compara referências. Use `Arrays.equals(a, b)`; para matrizes, `Arrays.deepEquals`.
- **Copiar matriz com `clone()` e achar que é profundo.** `m.clone()` copia as linhas de referência; alterar `copia[0][0]` afeta o original. Copie linha a linha.
- **Array covariance.** `Object[] objetos = new String[1]; objetos[0] = 42;` compila, mas lança `ArrayStoreException` em runtime. Prefira genéricos.
- **Confundir `length` com tamanho lógico.** Um array de 100 posições pode ter só 10 preenchidas; controle o índice usado.

## Checklist de domínio

- [ ] Você percorre arrays e matrizes sem off-by-one
- [ ] Você explica por que o for-each não altera posições de um array de primitivos
- [ ] Você sabe copiar arrays rasa e profundamente conforme o caso
- [ ] Você usa `Arrays.toString`, `equals` e `sort` em vez de reinventar

## Para ir além

- [dev.java — Arrays](https://dev.java/learn/language-basics/arrays/): criação, acesso e arrays multidimensionais.
- [Java SE 21 API — Arrays](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html): cópia, ordenação, busca e comparação.
- [Java Language Specification — Array Access](https://docs.oracle.com/javase/specs/jls/se21/html/jls-10.html): regras de tipo e exceções de índice.
