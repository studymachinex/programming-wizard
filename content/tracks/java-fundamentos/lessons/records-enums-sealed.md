> **Em uma frase:** Records eliminam boilerplate de valores imutáveis, enums fecham conjuntos de constantes com comportamento e sealed types permitem que o compilador conheça todos os subtipos de uma hierarquia.

## O problema

Uma classe `Coordenada` tinha 60 linhas: dois campos, construtor, getters, `equals`, `hashCode` e `toString`. Em uma refatoração, alguém adicionou um campo e esqueceu de atualizar o `equals`. Durante meses, coordenadas diferentes foram tratadas como iguais em um cache.

Do outro lado, um `status` era `String`. Valores como `"ATIVO"`, `"ativo"` e `"ACTIVE"` circulavam pelo sistema, e cada serviço comparava de um jeito. Quando o time trocou para enum, o compilador passou a apontar todos os lugares que precisavam de atenção.

## Como funciona

Um **record** é uma classe final com componentes declarados na cabeçalho. O compilador gera o construtor canônico, acessores com o mesmo nome do componente, `equals`, `hashCode` e `toString`. Os campos são `private final`; não há setters.

```java
import java.math.BigDecimal;
import java.util.Objects;

public class RecordsDemo {
    record Dinheiro(BigDecimal valor, String moeda) {
        Dinheiro {
            Objects.requireNonNull(valor, "valor");
            Objects.requireNonNull(moeda, "moeda");
            if (valor.signum() < 0) throw new IllegalArgumentException("valor negativo");
            if (moeda.length() != 3) throw new IllegalArgumentException("moeda ISO de 3 letras");
            moeda = moeda.toUpperCase();
        }

        Dinheiro somar(Dinheiro outro) {
            if (!moeda.equals(outro.moeda)) throw new IllegalArgumentException("moedas diferentes");
            return new Dinheiro(valor.add(outro.valor), moeda);
        }
    }

    public static void main(String[] args) {
        Dinheiro a = new Dinheiro(new BigDecimal("19.90"), "brl");
        Dinheiro b = new Dinheiro(new BigDecimal("10.10"), "BRL");
        System.out.println(a.somar(b)); // Dinheiro[valor=30.00, moeda=BRL]
        System.out.println(a.moeda());   // BRL, acessor sem get
    }
}
```

O bloco `Dinheiro { ... }` é o **construtor compacto**: você valida e normaliza, e o compilador atribui os campos no final. Não é preciso repetir `this.valor = valor`. Se um componente for uma lista, faça cópia defensiva aqui; `record Turma(List<Aluno> alunos)` é imutável na referência, não no conteúdo.

**Enums** são classes especiais com um conjunto fixo de instâncias. Podem ter campos, construtores privados, métodos e constantes com comportamento próprio. Não podem ser estendidos.

```java
public class StatusDemo {
    enum StatusPedido {
        NOVO(true), PAGO(true), ENVIADO(false), ENTREGUE(false), CANCELADO(false);

        private final boolean podeCancelar;

        StatusPedido(boolean podeCancelar) {
            this.podeCancelar = podeCancelar;
        }

        boolean podeCancelar() {
            return podeCancelar;
        }
    }

    public static void main(String[] args) {
        for (StatusPedido s : StatusPedido.values()) {
            System.out.println(s + " cancelável=" + s.podeCancelar());
        }
        StatusPedido s = StatusPedido.valueOf("PAGO");
        System.out.println(s.ordinal()); // 1 — não persista ordinal!
    }
}
```

`values()` devolve uma cópia do array; `valueOf` lança `IllegalArgumentException` para nome inválido. `ordinal()` é a posição na declaração e muda se alguém reordenar as constantes. Persistir ordinal em banco é um bug esperando deploy; grave o `name()` ou um código explícito.

## Na prática

**Sealed** permite declarar quais classes podem implementar ou estender um tipo. Os subtipos precisam ser `final`, `sealed` ou `non-sealed`. Isso fecha a hierarquia sem abrir mão de polimorfismo.

```java
public class Formas {
    sealed interface Forma permits Circulo, Retangulo {}
    record Circulo(double raio) implements Forma {}
    record Retangulo(double largura, double altura) implements Forma {}

    static double area(Forma forma) {
        return switch (forma) {
            case Circulo c -> Math.PI * c.raio() * c.raio();
            case Retangulo r -> r.largura() * r.altura();
        }; // exaustivo: sem default
    }

    public static void main(String[] args) {
        System.out.printf("%.2f%n", area(new Circulo(2)));        // 12.57
        System.out.printf("%.2f%n", area(new Retangulo(3, 4)));   // 12.00
    }
}
```

O compilador sabe que só existem `Circulo` e `Retangulo`. Se você adicionar `Triangulo` ao `permits`, o switch deixa de compilar até ser atualizado. É a rede de segurança que um `default` esconde.

Use record para DTOs, value objects, resultados de query e mensagens. Não use para entidades JPA: elas precisam de construtor sem argumentos e campos mutáveis para o provedor. Use enum para estados, tipos e códigos com conjunto fechado; nunca para valores que o usuário pode cadastrar.

## Armadilhas comuns

- **Record com coleção mutável sem cópia.** O chamador altera a lista interna. No construtor compacto, faça `alunos = List.copyOf(alunos)`.
- **Adicionar campos de instância a um record.** Só os componentes viram estado. Campos extras precisam ser `static`.
- **Persistir `ordinal()` de enum.** Reordenar constantes corrompe dados históricos. Persista `name()` ou um código estável.
- **Usar `default` em switch sobre sealed.** Você perde a checagem de exaustividade e o aviso quando um subtipo novo aparece.

## Checklist de domínio

- [ ] Você escreve records com construtor compacto e validação
- [ ] Você explica o que o record gera e o que ele não permite
- [ ] Você modela estados com enum e comportamento, não com String
- [ ] Você usa sealed + switch exaustivo para hierarquias fechadas

## Para ir além

- [JEP 395 — Records](https://openjdk.org/jeps/395): especificação e motivação.
- [JEP 409 — Sealed Classes](https://openjdk.org/jeps/409): regras de `permits` e subtipos.
- [dev.java — Records](https://dev.java/learn/records/): guia oficial com construtores compactos.
