> **Em uma frase:** Java passa tudo por valor — cópias de primitivos e cópias de referências — e um método bem projetado tem nome que diz o que faz, contrato claro e uma única responsabilidade.

## O problema

Um método `processar` recebia dez parâmetros, alterava dois deles e devolvia `null` em caso de erro. Seis meses depois, ninguém sabia quais argumentos eram entrada, quais eram saída e o que significava o retorno nulo. Cada chamada exigia abrir o corpo do método.

Métodos são a unidade básica de composição em Java. Quando eles são pequenos, nomeados pelo comportamento e com efeitos colaterais visíveis, o código vira legível. Quando não são, a complexidade se espalha e os testes ficam impossíveis de isolar.

## Como funciona

A assinatura de um método é nome + tipos dos parâmetros. O tipo de retorno não faz parte da assinatura para fins de sobrecarga: `int buscar(String)` e `String buscar(String)` não podem coexistir.

```java
public class Calculadora {
    // Método puro: mesmo input, mesmo output, sem efeito colateral
    static int somar(int a, int b) {
        return a + b;
    }

    // Procedimento: efeito colateral explícito no nome
    static void registrarLog(String mensagem) {
        System.err.println("[LOG] " + mensagem);
    }

    public static void main(String[] args) {
        int resultado = somar(2, 3);
        registrarLog("resultado=" + resultado);
        System.out.println(resultado); // 5
    }
}
```

Variáveis locais vivem no bloco onde foram declaradas. Um `for` tem seu próprio escopo; um bloco `if` também. O compilador exige inicialização antes do primeiro uso, então `int x; System.out.println(x);` não compila. Isso é uma proteção, não uma limitação.

Java é **sempre passagem por valor**. Para primitivos, o valor é copiado. Para objetos, o valor copiado é a referência. O objeto continua o mesmo, mas a variável do método é independente.

```java
import java.util.Arrays;

public class Passagem {
    static void trocar(int a, int b) {
        int temp = a;
        a = b;
        b = temp;
    }

    static void alterarArray(int[] dados) {
        dados[0] = 99;       // altera o objeto compartilhado
        dados = new int[]{7}; // troca apenas a referência local
    }

    public static void main(String[] args) {
        int x = 1, y = 2;
        trocar(x, y);
        System.out.println(x + "," + y); // 1,2 — não trocou

        int[] numeros = {1, 2, 3};
        alterarArray(numeros);
        System.out.println(Arrays.toString(numeros)); // [99, 2, 3]
    }
}
```

Se Java fosse passagem por referência, `trocar` funcionaria e `dados = new int[]{7}` mudaria o array do chamador. Nenhum dos dois acontece. Entender isso evita a tentativa de "retornar dois valores" via parâmetros.

## Na prática

Varargs permite chamar um método com zero ou mais argumentos do mesmo tipo. Na assinatura, `String... tags` é um array `String[]`. Ele precisa ser o último parâmetro.

```java
public class Relatorio {
    static double media(double... valores) {
        if (valores.length == 0) {
            throw new IllegalArgumentException("informe ao menos um valor");
        }
        double soma = 0;
        for (double v : valores) soma += v;
        return soma / valores.length;
    }

    static String juntar(String separador, String... partes) {
        return String.join(separador, partes);
    }

    public static void main(String[] args) {
        System.out.println(media(7, 9, 10));       // 8.666...
        System.out.println(media());               // IllegalArgumentException
        System.out.println(juntar("-", "a", "b")); // a-b
        System.out.println(juntar(","));           // vazio
    }
}
```

Sobrecarga é resolvida em tempo de compilação, pelo tipo declarado dos argumentos. `somar(1, 2)` chama `somar(int, int)`; `somar(1L, 2L)` chama `somar(long, long)`. Autoboxing e varargs podem criar ambiguidade: `somar(1, 2)` com versões `(int,int)` e `(Integer,Integer)` escolhe a primeira, mas `somar()` com `(int...)` e `(Integer...)` pode não compilar por ambiguidade. Se você precisa pensar demais, renomeie os métodos.

Projete métodos com no máximo três ou quatro parâmetros. Acima disso, agrupe em um objeto de requisição com nome de domínio. Evite booleanos posicionais: `criarConta("Ana", true, false)` não diz o que cada flag faz; `criarConta("Ana", Status.ATIVO, Plano.PREMIUM)` diz.

## Armadilhas comuns

- **Achar que objetos são passados por referência.** Reatribuir o parâmetro não afeta o chamador; mutar o objeto afeta. São efeitos diferentes.
- **Modificar parâmetros de entrada.** Isso surpreende quem lê e dificulta testes. Trate parâmetros como valores e devolva um novo resultado.
- **Varargs com array nulo.** `media((double[]) null)` compila e explode com NPE. Varargs aceita zero argumentos, mas não um array nulo explícito.
- **Métodos que fazem demais.** Se o nome precisa de "e" (`validarECalcularEEnviar`), separe. Um método, um nível de abstração.

## Checklist de domínio

- [ ] Você demonstra, com código, que Java é passagem por valor
- [ ] Você sabe quando um varargs é útil e por que ele fica por último
- [ ] Você evita listas longas de parâmetros com objetos de requisição
- [ ] Você identifica métodos que misturam cálculo, validação e I/O

## Para ir além

- [dev.java — Methods](https://dev.java/learn/classes-objects/methods/): declaração, retorno e sobrecarga.
- [Java Language Specification — Method Declarations](https://docs.oracle.com/javase/specs/jls/se21/html/jls-8.html#jls-8.4): regras de assinatura e varargs.
- [Baeldung — Pass-By-Value in Java](https://www.baeldung.com/java-pass-by-value-or-pass-by-reference): exemplos que desmontam a confusão com referências.
