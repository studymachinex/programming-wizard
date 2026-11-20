> **Em uma frase:** pilha é a estrutura da reversão: o último a entrar é o primeiro a sair, e quase todo problema que pede "desfazer" ou "casar com o mais recente" é uma pilha disfarçada.

## O problema

Um editor de texto precisa desfazer a última ação, não a primeira. Um compilador precisa validar se cada `}` fecha o `{` mais recente, não um `{` qualquer. Uma calculadora em notação polonesa reversa precisa aplicar o operador aos dois últimos operandos. Em todos os casos, a ordem importa e é LIFO: last in, first out.

A pilha é a estrutura mais simples que captura essa semântica: você só pode inserir e remover no topo. Essa restrição parece limitante, mas é justamente o que torna o código previsível. O `return` de um método, a chamada de função e a avaliação de uma expressão são todos exemplos de pilha — inclusive a call stack da JVM, que guarda os frames de métodos aninhados.

## Como funciona

Uma pilha tem três operações: `push` (empilha), `pop` (desempilha) e `peek` (consulta o topo). Todas são O(1). Não há acesso por índice, busca ou iteração ordenada. Implementações comuns:

- **Array dinâmico:** um `int[]` com um índice `topo`. É a mais rápida e cache-friendly; cresce dobrando.
- **Lista ligada:** cada push cria um nó. Funciona, mas tem custo de objeto e localidade pior.
- **`ArrayDeque`:** a escolha padrão em Java para pilha e fila. Internamente é um array circular, sem sincronização.
- **`java.util.Stack`:** legado, estende `Vector`, sincroniza todos os métodos. Evite em código novo.

| Operação | ArrayStack | LinkedList | ArrayDeque |
|---|---|---|---|
| push | O(1) amortizado | O(1) | O(1) amortizado |
| pop | O(1) | O(1) | O(1) |
| peek | O(1) | O(1) | O(1) |
| memória | baixa | alta | baixa |
| null | permitido | permitido | proibido |

O código abaixo implementa uma pilha de inteiros com array e crescimento amortizado. É o tipo de implementação que entrevistadores pedem para ver se você trata underflow e resize.

```java
import java.util.Arrays;

public class IntStack {
    private int[] dados = new int[8];
    private int topo = -1; // -1 significa vazia

    public void push(int valor) {
        if (topo + 1 == dados.length) {
            dados = Arrays.copyOf(dados, dados.length * 2);
        }
        dados[++topo] = valor;
    }

    public int pop() {
        if (isEmpty()) {
            throw new IllegalStateException("pop em pilha vazia");
        }
        return dados[topo--];
    }

    public int peek() {
        if (isEmpty()) {
            throw new IllegalStateException("peek em pilha vazia");
        }
        return dados[topo];
    }

    public boolean isEmpty() {
        return topo < 0;
    }

    public int size() {
        return topo + 1;
    }

    public static void main(String[] args) {
        IntStack s = new IntStack();
        s.push(10);
        s.push(20);
        System.out.println(s.peek()); // 20
        System.out.println(s.pop());  // 20
        System.out.println(s.pop());  // 10
        System.out.println(s.isEmpty()); // true
    }
}
```

Repare que `topo` começa em -1 e o primeiro push grava em `dados[0]`. A alternativa é começar em 0 e usar "topo aponta para o próximo slot livre"; ambas funcionam, mas misturar as convenções é uma fonte clássica de off-by-one. Escolha uma e documente.

## Na prática

Validação de parênteses é o exercício canônico. Para cada caractere: se é abertura, empilhe; se é fechamento, verifique se o topo é o par correspondente e desempilhe. No fim, a pilha precisa estar vazia. O mesmo padrão resolve tags HTML, blocos de código e expressões com colchetes. O segundo exemplo avalia expressões em notação polonesa reversa (RPN), usada por calculadoras HP e por compiladores internamente.

```java
import java.util.ArrayDeque;
import java.util.Deque;

public class Aplicacoes {

    public static boolean parentesesValidos(String s) {
        Deque<Character> pilha = new ArrayDeque<>();
        for (char c : s.toCharArray()) {
            switch (c) {
                case '(' -> pilha.push(')');
                case '[' -> pilha.push(']');
                case '{' -> pilha.push('}');
                case ')', ']', '}' -> {
                    if (pilha.isEmpty() || pilha.pop() != c) {
                        return false;
                    }
                }
                default -> { /* ignora outros caracteres */ }
            }
        }
        return pilha.isEmpty();
    }

    // "3 4 + 2 *" = 14. O(n) tempo, O(n) espaço.
    public static int avaliaRpn(String expressao) {
        Deque<Integer> pilha = new ArrayDeque<>();
        for (String token : expressao.trim().split("\\s+")) {
            switch (token) {
                case "+", "-", "*", "/" -> {
                    if (pilha.size() < 2) {
                        throw new IllegalArgumentException("expressão inválida");
                    }
                    int b = pilha.pop(); // cuidado: a ordem importa
                    int a = pilha.pop();
                    int r = switch (token) {
                        case "+" -> a + b;
                        case "-" -> a - b;
                        case "*" -> a * b;
                        default -> {
                            if (b == 0) {
                                throw new ArithmeticException("divisão por zero");
                            }
                            yield a / b;
                        }
                    };
                    pilha.push(r);
                }
                default -> pilha.push(Integer.parseInt(token));
            }
        }
        if (pilha.size() != 1) {
            throw new IllegalArgumentException("expressão inválida");
        }
        return pilha.pop();
    }

    public static void main(String[] args) {
        System.out.println(parentesesValidos("{[()]}")); // true
        System.out.println(parentesesValidos("([)]"));   // false
        System.out.println(avaliaRpn("3 4 + 2 *"));      // 14
    }
}
```

No RPN, a ordem dos operandos é uma armadilha: o primeiro `pop` é o operando da direita. Para `7 3 -`, você desempilha 3 (b), depois 7 (a), e calcula `a - b = 4`. Se inverter, obtém -4. Em multiplicação e soma a ordem não importa, o que faz o bug passar nos testes mais óbvios e aparecer só na subtração e divisão.

Pilhas também aparecem em **undo**: cada ação empilha um comando com os dados necessários para revertê-la. O limite de histórico é uma decisão de produto e de memória; um `Deque` com tamanho máximo simula um buffer de undo. Em **DFS iterativo**, a pilha substitui a recursão e evita `StackOverflowError` em grafos profundos. Em **parsing**, a pilha mantém o estado aninhado. Todos são o mesmo princípio: adiar o processamento do item mais recente.

## Armadilhas comuns

- **`pop` ou `peek` em pilha vazia.** `ArrayDeque` lança `NoSuchElementException`; `Stack` lança `EmptyStackException`. Verifique `isEmpty()` ou use `poll`/`peek` quando vazio for um estado válido.
- **Inverter operandos em RPN.** O primeiro pop é o lado direito da operação. Teste subtração e divisão com números diferentes.
- **Usar `java.util.Stack`.** É sincronizada e herda `Vector`; em single-thread, `ArrayDeque` é mais rápida.
- **Esquecer de validar o fim.** `"{[()"` tem todos os fechamentos corretos até o fim, mas sobra abertura; só a pilha vazia no final confirma.
- **Empilhar objetos pesados sem limite.** Um histórico de undo que guarda cópias profundas de documentos pode consumir gigabytes; guarde diffs ou comandos.

## Checklist de domínio

- [ ] Você implementa push/pop/peek com array e trata underflow
- [ ] Você valida parênteses com pilha e explica por que o topo é o par certo
- [ ] Você avalia RPN respeitando a ordem dos operandos
- [ ] Você sabe por que `ArrayDeque` substitui `Stack` no código novo

## Para ir além

- [Oracle — Deque (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Deque.html): contrato de pilha e fila com `ArrayDeque`.
- [LeetCode — Valid Parentheses](https://leetcode.com/problems/valid-parentheses/): validação com pilha.
- [LeetCode — Evaluate Reverse Polish Notation](https://leetcode.com/problems/evaluate-reverse-polish-notation/): ordem de operandos na prática.
