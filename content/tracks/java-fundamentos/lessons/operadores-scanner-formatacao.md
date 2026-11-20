> **Em uma frase:** Operadores têm precedência e efeitos colaterais que precisam ser previsíveis; entrada e saída são contratos com o mundo e merecem o mesmo cuidado que a lógica.

## O problema

Um aluno envia a solução de um juiz online e recebe "Presentation Error". Outro lê a idade com `nextInt()` e depois o nome com `nextLine()`, e o nome vem vazio. Um terceiro calcula `"Total: " + 10 + 5` e mostra `Total: 105` quando queria `Total: 15`.

Nenhum desses problemas é de algoritmo. São de contrato: como o texto vira número, como o número vira texto e como uma expressão é agrupada. Em aplicações reais, a mesma classe de erro aparece em parsing de CSV, logs e APIs.

## Como funciona

A precedência segue, do mais forte para o mais fraco: pós-fixos (`x++`), unários (`!`, `-`, cast), multiplicação e divisão, soma e subtração, deslocamentos, comparações, igualdade, `&`, `^`, `|`, `&&`, `||`, ternário e atribuição. Na dúvida, parênteses são documentação.

`&&` e `||` fazem curto-circuito: o lado direito só é avaliado se o resultado ainda não é conhecido. Isso permite `if (lista != null && !lista.isEmpty())` sem `NullPointerException`. Já `&` e `|` avaliam os dois lados sempre — em booleanos, quase nunca é o que você quer.

```java
public class Operadores {
    public static void main(String[] args) {
        int a = 7, b = 2;
        System.out.println(a / b);          // 3
        System.out.println((double) a / b); // 3.5
        System.out.println(a % b);          // 1

        System.out.println("Total: " + 10 + 5); // Total: 105
        System.out.println(10 + 5 + " total");  // 15 total

        boolean seguro = b != 0 && a / b > 2; // curto-circuito
        System.out.println(seguro); // true

        byte pequeno = 10;
        pequeno += 5; // compila: há cast implícito para byte
        // pequeno = pequeno + 5; // não compila: int não cabe em byte sem cast
        System.out.println(pequeno); // 15
    }
}
```

O `+=` não é apenas açúcar: ele aplica um cast implícito para o tipo da variável. Por isso `byte b = 10; b += 5;` compila e `b = b + 5;` não. Em contrapartida, esse cast silencioso pode esconder estouro em tipos pequenos.

A divisão inteira descarta a fração; o resto acompanha o sinal do dividendo: `-7 % 2` é `-1`. Para índices circulares, `(i + 1) % n` funciona bem com `i` não negativo. Para arredondar para cima use `(a + b - 1) / b` com inteiros positivos.

## Na prática

`Scanner` lê tokens separados por whitespace, com métodos por tipo. O problema clássico é misturar `nextInt()` com `nextLine()`: o primeiro consome o número e deixa o `\n` no buffer; o segundo encontra apenas esse `\n` e devolve string vazia.

```java
import java.util.Locale;
import java.util.Scanner;

public class Cadastro {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in).useLocale(Locale.US);

        System.out.print("Nome: ");
        String nome = sc.nextLine().trim();

        System.out.print("Idade: ");
        int idade = Integer.parseInt(sc.nextLine().trim());

        System.out.print("Saldo: ");
        double saldo = Double.parseDouble(sc.nextLine().trim());

        System.out.printf("%-20s | %03d anos | R$ %,.2f%n", nome, idade, saldo);
        // Ana                  | 028 anos | R$ 1,234.50
    }
}
```

Ler a linha inteira e converter com `Integer.parseInt` elimina o descasamento de buffer e permite tratar entrada inválida com `NumberFormatException`. Em formulários e arquivos, esse é o padrão mais robusto. Para entradas enormes, `BufferedReader` costuma ser mais rápido que `Scanner`, mas o desempenho raramente é o gargalo antes de o parsing ser medido.

Formatação usa a sintaxe de `printf`: `%d` inteiro, `%s` texto, `%f` decimal, `%.2f` duas casas, `%08d` oito posições com zeros à esquerda, `%-10s` alinhado à esquerda, `%n` quebra de linha portátil. O separador decimal e de milhar vem do `Locale` padrão da JVM. Em um contêiner com locale diferente, `%,.2f` pode imprimir `1.234,50` ou `1,234.50`. Defina `Locale.US` ou `Locale.forLanguageTag("pt-BR")` explicitamente quando o formato fizer parte do contrato.

## Armadilhas comuns

- **Confiar no `Locale` padrão.** O mesmo código formata diferente em cada máquina. Especifique o locale na formatação, não no `String.format` global.
- **Usar `nextInt` e depois `nextLine`.** O `\n` residual produz string vazia. Leia linhas e converta, ou consuma a linha pendente.
- **Ignorar `hasNextInt` em entrada interativa.** `InputMismatchException` não é uma mensagem amigável para o usuário.
- **Comparar Strings com `==`.** `==` compara referências; use `equals`. O pool de strings faz `"a" == "a"` funcionar às vezes e falhar em runtime com strings construídas.

## Checklist de domínio

- [ ] Você prever o resultado de expressões com `+`, divisão e casting sem executar
- [ ] Você lê entradas mistas com `Scanner` sem cair no bug da linha vazia
- [ ] Você formata valores com `printf` e locale explícito
- [ ] Você diferencia `&&` de `&` e sabe por que o curto-circuito importa

## Para ir além

- [Java Language Specification — Expressions](https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html): precedência e regras de avaliação.
- [Java SE 21 API — Scanner](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Scanner.html): delimitadores, locale e métodos de leitura.
- [Java SE 21 API — Formatter](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Formatter.html): todos os especificadores de formato.
