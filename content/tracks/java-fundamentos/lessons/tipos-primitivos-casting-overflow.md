> **Em uma frase:** Todo valor em Java tem um tipo com tamanho e faixa fixos, e operações que ultrapassam essa faixa não lançam exceção — elas dão a volta em silêncio.

## O problema

Um relatório de vendas mostra faturamento negativo em dezembro. O código era `int total = quantidade * precoUnitario;`. Quantidade: 3 milhões de unidades. Preço: 1.500 centavos. O produto passa de 4,5 bilhões, mas `int` só vai até 2.147.483.647. A multiplicação estourou, virou um número negativo e o relatório foi para a diretoria.

Esse é o tipo de bug que não aparece em teste pequeno, não gera exceção e não deixa stack trace. Ele nasce de uma decisão de tipo tomada sem pensar. Escolher entre `int`, `long`, `double` e `BigDecimal` é decisão de domínio, não detalhe sintático.

## Como funciona

Java tem oito primitivos. Eles não são objetos, ficam na stack ou embutidos em objetos e têm tamanho definido pela especificação — diferente de C, onde `int` depende da plataforma.

| Tipo | Tamanho | Faixa aproximada | Uso típico |
|---|---|---|---|
| `byte` | 8 bits | -128 a 127 | Dados binários |
| `short` | 16 bits | -32.768 a 32.767 | Quase nunca |
| `int` | 32 bits | ±2,1 bilhões | Contadores e medidas |
| `long` | 64 bits | ±9,2 quintilhões | IDs, tempo em ms |
| `float` | 32 bits | ~7 dígitos | Gráficos, não dinheiro |
| `double` | 64 bits | ~15 dígitos | Cálculo científico |
| `char` | 16 bits | 0 a 65.535 | Um code unit UTF-16 |
| `boolean` | JVM-dependente | true/false | Decisões |

`int` ocupa 32 bits em complemento de dois. O bit mais à esquerda é sinal: `Integer.MAX_VALUE` é `0111...1111` (2.147.483.647) e somar um produz `1000...0000`, que é `Integer.MIN_VALUE` (-2.147.483.648). Não há flag de overflow na aritmética comum.

```java
public class Overflow {
    public static void main(String[] args) {
        int max = Integer.MAX_VALUE;
        System.out.println(max);      // 2147483647
        System.out.println(max + 1);  // -2147483648: deu a volta

        try {
            System.out.println(Math.addExact(max, 1));
        } catch (ArithmeticException e) {
            System.out.println("Estourou: " + e.getMessage());
        }

        // 1 bilhão de segundos cabe em int; 3 bilhões só cabe em long.
        int umBilhao = 1_000_000_000;
        long tresBilhoes = 3_000_000_000L;
        System.out.println(umBilhao + tresBilhoes);
    }
}
```

O último literal nem compila, o que é bom: o compilador avisa quando o valor é conhecido em tempo de compilação. O perigo está no valor calculado em runtime.

Casting é a conversão explícita entre tipos. De `int` para `long` há ampliação automática e segura. De `long` para `int` há estreitamento: os bits altos são descartados. De `double` para `int`, a parte fracionária é truncada em direção a zero, e valores fora da faixa viram `Integer.MAX_VALUE` ou `MIN_VALUE`.

```java
public class Casting {
    public static void main(String[] args) {
        long populacao = 8_100_000_000L;
        int truncado = (int) populacao;
        System.out.println(truncado); // 3_805_032_704 - 2^32

        System.out.println((int) 3.99);  // 3, trunca
        System.out.println((int) -3.99); // -3, trunca em direção a zero
        System.out.println(Math.round(3.99)); // 4

        int centavos = (int) Math.round(19.99 * 100);
        System.out.println(centavos); // 1999

        int a = 7, b = 2;
        double media = (double) a / b; // sem o cast, 3.0
        System.out.println(media);     // 3.5
    }
}
```

Repare em `(double) a / b`: o cast acontece antes da divisão. `(double) (a / b)` dividiria como inteiro e só depois converteria, resultando em `3.0`.

## Na prática

A regra prática é: use `int` para contadores e índices; `long` para IDs, timestamps e qualquer soma que possa passar de 2 bilhões; `double` para medidas físicas; `BigDecimal` para dinheiro e cálculos com escala definida. Para dinheiro em centavos, `long` funciona e é rápido, desde que você nunca misture centavos com reais.

Multiplicações são as mais traiçoeiras porque dois valores "pequenos" podem gerar um produto grande. `int dias = 365; long milissegundos = dias * 24 * 60 * 60 * 1000;` está errado: a conta é feita em `int` e estoura antes de virar `long`. A correção é `365L * 24 * 60 * 60 * 1000`.

Quando o estouro é inaceitável, use `Math.addExact`, `subtractExact` e `multiplyExact`. Eles lançam `ArithmeticException` em vez de dar a volta. O custo é pequeno comparado ao de um relatório financeiro errado. Para acumuladores críticos, essa é a escolha padrão em código de produção.

Cuidado também com `Math.abs(Integer.MIN_VALUE)`: o resultado é negativo, porque o valor absoluto de -2.147.483.648 não cabe em `int`. Use `Math.abs((long) valor)` ou `Math.negateExact` quando o caso puder aparecer.

## Armadilhas comuns

- **Achar que overflow lança exceção.** Aritmética de primitivos é silenciosa. Só os métodos `*Exact` reclamam.
- **Usar `float` ou `double` para dinheiro.** `0.1 + 0.2` não é exatamente `0.3` em binário. Use `BigDecimal` com escala ou inteiros em centavos.
- **Esquecer o sufixo `L`.** `long x = 3_000_000_000;` não compila porque o literal é `int`; `3_000_000_000L` compila.
- **Comparar wrappers com `==`.** `Integer` faz cache de -128 a 127; dois `Integer` de 1000 podem ser referências diferentes. Compare com `equals`.

## Checklist de domínio

- [ ] Você escolhe o tipo certo para dinheiro, IDs e timestamps sem pensar duas vezes
- [ ] Você explica por que `Integer.MAX_VALUE + 1` fica negativo
- [ ] Você sabe quando o casting trunca e quando arredonda
- [ ] Você usa `Math.*Exact` em cálculos que não podem estourar

## Para ir além

- [Java Language Specification — Primitive Types](https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.2): faixas e representação exatas.
- [Java SE 21 API — Math](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Math.html): `addExact`, `multiplyExact`, `round` e comportamento de borda.
- [Baeldung — BigDecimal and BigInteger in Java](https://www.baeldung.com/java-bigdecimal-biginteger): quando e como trocar primitivos por precisão arbitrária.
