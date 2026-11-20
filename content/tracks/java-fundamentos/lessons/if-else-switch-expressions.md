> **Em uma frase:** Decisões legíveis têm condições explícitas, casos mutuamente exclusivos e um caminho claro para o que não se encaixa em nenhum deles.

## O problema

Um sistema de frete calculava o valor assim: `if (peso > 10) { if (regiao.equals("NORTE")) { ... } else { ... } } else if (...)`. Depois de seis meses, ninguém conseguia responder se a região NORTE com peso 10 pagava frete padrão ou expresso. O bug existia, mas estava escondido na profundidade da árvore, não em uma linha específica.

Outro clássico: um `switch` sem `break` no caso `PENDENTE` executava também o código de `CANCELADO`. O pedido aparecia como cancelado e pendente no mesmo fluxo. A linguagem permite esse comportamento de propósito, mas ele raramente é intenção.

## Como funciona

O `if` exige uma expressão `boolean`. Java não converte inteiros ou objetos em verdadeiro/falso, então `if (1)` e `if (objeto)` não compilam. Isso elimina uma família inteira de bugs de C, mas obriga a escrever comparações explícitas.

A ordem importa. `if (valor > 10)` antes de `if (valor > 100)` nunca deixa o segundo caso ser alcançado para valores acima de 100. Coloque as condições mais específicas primeiro, ou reescreva com intervalos mutuamente exclusivos.

Cláusulas de guarda reduzem aninhamento: em vez de envolver todo o método em `if (cliente != null) { ... }`, retorne cedo.

```java
public class Classificacao {
    public static String categoria(int idade) {
        if (idade < 0) {
            throw new IllegalArgumentException("idade não pode ser negativa: " + idade);
        }
        if (idade < 12) return "criança";
        if (idade < 18) return "adolescente";
        if (idade < 60) return "adulto";
        return "idoso";
    }

    public static void main(String[] args) {
        System.out.println(categoria(10));  // criança
        System.out.println(categoria(17));  // adolescente
        System.out.println(categoria(42));  // adulto
        System.out.println(categoria(60));  // idoso
    }
}
```

Cada `if` só é alcançado se os anteriores falharam. Isso funciona como uma cadeia de intervalos e é mais fácil de auditar do que `else if` aninhados.

O `switch` moderno tem duas formas. A clássica usa `:` e exige `break` para não cair no próximo caso. A forma com `->` executa apenas o braço escolhido. Quando o switch produz um valor, ele é uma **switch expression**, e o compilador exige que todos os caminhos devolvam algo — seja cobrindo todos os valores de um enum, seja com `default`.

```java
public class Frete {
    enum Regiao { NORTE, NORDESTE, SUDESTE, SUL, CENTRO_OESTE }

    static double calcular(Regiao regiao, double pesoKg) {
        double base = switch (regiao) {
            case NORTE, NORDESTE -> 18.0;
            case SUDESTE -> 12.0;
            case SUL -> 14.0;
            case CENTRO_OESTE -> 16.0;
        }; // exaustivo: não precisa de default

        double adicional = pesoKg > 10 ? (pesoKg - 10) * 2.5 : 0.0;
        return base + adicional;
    }

    public static void main(String[] args) {
        System.out.printf("%.2f%n", calcular(Regiao.NORTE, 12));  // 23.00
        System.out.printf("%.2f%n", calcular(Regiao.SUDESTE, 8)); // 12.00
    }
}
```

Quando o braço precisa de mais de uma instrução, use bloco e `yield` para devolver o valor. `return` sairia do método inteiro; `break` não é permitido como valor.

## Na prática

Prefira `switch` expression quando existe um conjunto fechado de casos e você quer que o compilador cobre cobertura. Ao adicionar uma região nova ao enum, o switch deixa de compilar até você tratá-la. Isso é uma vantagem enorme em produção: o erro aparece no build, não no cliente.

Use `if` para regras compostas, intervalos e validações. Use `switch` para mapeamentos valor → resultado. Quando o switch começa a crescer e cada braço chama lógica de negócio diferente, considere polimorfismo: um enum com método abstrato ou uma hierarquia `sealed` costuma expressar melhor "cada tipo sabe fazer sua parte".

O operador ternário é útil para escolhas de uma linha: `String status = saldo >= 0 ? "ATIVO" : "BLOQUEADO";`. Evite aninhá-lo. `a ? b : c ? d : e` é legal e quase sempre ilegível.

## Armadilhas comuns

- **Esquecer o `break` no switch clássico.** O fluxo cai no braço seguinte. Prefira `->` em código novo.
- **Usar `default` para esconder casos não tratados.** Em enums, um `default` impede o compilador de avisar quando um valor novo aparece. Deixe o switch exaustivo.
- **Comparar `double` com `==`.** `0.1 + 0.2 == 0.3` é falso. Compare com tolerância ou use `BigDecimal`.
- **Fazer `switch` em valor possivelmente nulo.** Em Java 21, `switch (obj)` com `null` lança `NullPointerException`; trate antes ou use `case null` quando o tipo permitir.

## Checklist de domínio

- [ ] Você reescreve um `if` aninhado usando cláusulas de guarda
- [ ] Você usa switch expression com `->` e `yield` sem hesitar
- [ ] Você sabe por que um switch exaustivo sobre enum é mais seguro que um com `default`
- [ ] Você reconhece quando a decisão deveria virar polimorfismo

## Para ir além

- [JEP 361 — Switch Expressions](https://openjdk.org/jeps/361): motivação, sintaxe e regras de exaustividade.
- [dev.java — Branching with Switch](https://dev.java/learn/language-basics/switch/): exemplos oficiais com arrow e yield.
- [Java Language Specification — if Statements](https://docs.oracle.com/javase/specs/jls/se21/html/jls-14.html#jls-14.9): regras exatas de compilação.
