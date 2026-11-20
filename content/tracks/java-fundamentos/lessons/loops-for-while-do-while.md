> **Em uma frase:** O laço certo comunica a intenção antes do código: `for` para contagem conhecida, `while` para condição que muda e `do-while` quando o corpo precisa rodar ao menos uma vez.

## O problema

Um processamento de folha de pagamento travou às 3h da manhã. O laço era `while (funcionario != null)` e, em um certo registro, uma atualização fazia o ponteiro voltar para o mesmo objeto. Nenhuma exceção, nenhum log: só CPU em 100% e a fila crescendo.

Loops são onde os erros de raciocínio viram indisponibilidade. Off-by-one, condição que não avança, variável modificada no lugar errado e `break` que sai do laço de dentro em vez do de fora são falhas que testes de caminho feliz não pegam.

## Como funciona

O `for` clássico tem três partes: inicialização, condição e atualização. A variável declarada nele vive apenas no laço. É a escolha natural quando você sabe quantas iterações existem ou quando precisa do índice.

```java
public class Loops {
    public static void main(String[] args) {
        long fatorial = 1;
        for (int i = 1; i <= 10; i++) {
            fatorial *= i;
        }
        System.out.println(fatorial); // 3628800

        int soma = 0;
        for (int i = 1; i <= 100; i++) {
            soma += i;
        }
        System.out.println(soma); // 5050

        // Loop decrescente: o último valor processado é 1
        for (int i = 5; i >= 1; i--) {
            System.out.print(i + " ");
        }
        System.out.println(); // 5 4 3 2 1
    }
}
```

O `while` testa a condição antes de cada iteração. Use quando a quantidade de repetições depende de algo externo: ler até o fim do arquivo, consumir até a fila esvaziar, esperar um estado mudar. Dentro do corpo, algo precisa aproximar a condição de falso; se isso não for evidente, o laço é suspeito.

O `do-while` testa depois. A primeira execução é garantida. É útil para menus interativos e para tentar uma operação pelo menos uma vez antes de decidir se repete.

```java
import java.util.Scanner;

public class Menu {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int opcao;

        do {
            System.out.println("1 - Somar | 2 - Sair");
            opcao = Integer.parseInt(sc.nextLine().trim());

            if (opcao == 1) {
                System.out.print("Primeiro número: ");
                int a = Integer.parseInt(sc.nextLine().trim());
                System.out.print("Segundo número: ");
                int b = Integer.parseInt(sc.nextLine().trim());
                System.out.println("Resultado: " + (a + b));
            }
        } while (opcao != 2);

        System.out.println("Encerrado.");
    }
}
```

Repare que `opcao` é declarada fora do `do`: ela precisa existir na condição. Se fosse declarada dentro, o compilador reclamaria de variável não inicializada.

`break` encerra o laço; `continue` salta para a próxima iteração. Em laços aninhados, ambos afetam apenas o laço mais interno. Para sair de dois níveis, use um rótulo — recurso pouco usado, mas mais claro que uma flag booleana:

```java
public class BuscaMatriz {
    public static void main(String[] args) {
        int[][] matriz = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
        int alvo = 5;
        boolean encontrado = false;

        busca:
        for (int i = 0; i < matriz.length; i++) {
            for (int j = 0; j < matriz[i].length; j++) {
                if (matriz[i][j] == alvo) {
                    encontrado = true;
                    break busca;
                }
            }
        }
        System.out.println("Encontrado: " + encontrado); // true
    }
}
```

## Na prática

Antes de escrever o laço, responda três perguntas: qual é o estado inicial, qual é a condição de continuidade e o que garante que ela vai eventualmente falhar? Essa última é a prova de término. Em `for (int i = 0; i < n; i++)`, `i` cresce e `n` é fixo; termina. Em `while (saldo > 0) { saldo -= taxa; }`, se `taxa` for zero, nunca termina.

Evite modificar a coleção que está percorrendo com for-each. `for (String item : lista) { if (item.isBlank()) lista.remove(item); }` lança `ConcurrentModificationException`. Use `removeIf` ou um `Iterator` explícito. Em arrays, o for-each não permite remover, e alterar a variável de iteração não altera o array.

Para laços com muita concatenação de String, use `StringBuilder`. `resultado += linha` dentro de 10 mil iterações cria 10 mil objetos intermediários; `builder.append(linha)` amortiza o custo. Em uma exportação de 500 mil linhas, a diferença é de segundos e de pressão no GC.

## Armadilhas comuns

- **Off-by-one.** `i <= array.length` acessa uma posição inexistente. O último índice é `length - 1`.
- **Esquecer de avançar.** `while (i < 10)` sem `i++` no corpo trava a thread. O mesmo vale para `continue` que pula a atualização.
- **Alterar a coleção durante o for-each.** Use o iterador, `removeIf` ou construa uma nova coleção.
- **Laço com ponto flutuante.** `for (double d = 0.0; d != 1.0; d += 0.1)` pode nunca terminar por erro de representação. Use inteiros e divida no final.

## Checklist de domínio

- [ ] Você escolhe entre `for`, `while` e `do-while` pela intenção, não pelo hábito
- [ ] Você consegue provar que todo laço que escreve termina
- [ ] Você usa `break`/`continue` com rótulo quando necessário, sem flags confusas
- [ ] Você reconhece e corrige off-by-one em limites de array

## Para ir além

- [dev.java — Controlling Flow with Loops](https://dev.java/learn/language-basics/loops/): sintaxe e exemplos oficiais.
- [Java Language Specification — while, do, for](https://docs.oracle.com/javase/specs/jls/se21/html/jls-14.html#jls-14.12): semântica exata, incluindo escopo da variável do for.
- [Baeldung — Iterator vs for-each](https://www.baeldung.com/java-iterator-vs-for-loop): por que remover durante o for-each quebra.
