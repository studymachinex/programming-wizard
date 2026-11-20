> **Em uma frase:** Interface define um contrato que qualquer tipo pode cumprir; classe abstrata define uma base parcial com estado e construtores — escolha pelo que você precisa compartilhar, não pelo que parece mais "orientado a objetos".

## O problema

Um time criou `AbstractRepository` com dez métodos abstratos, um campo `EntityManager` e três métodos concretos. Toda implementação precisava estender a classe, mesmo quando só queria cumprir o contrato. Isso impedia que uma classe de domínio já existente fosse um repositório, porque Java não permite herdar de duas classes.

O outro extremo também acontece: uma interface com quinze métodos `default` que guarda estado em campos estáticos e implementa metade da lógica. Ela virou uma classe abstrata disfarçada, com todos os problemas de herança e nenhuma das vantagens de um contrato limpo.

## Como funciona

Uma interface declara um tipo e um contrato. Todos os métodos abstratos são implicitamente `public`. Campos são implicitamente `public static final`. Desde Java 8, interfaces podem ter métodos `default` (implementação padrão) e `static`; desde Java 9, também `private`, usados para auxiliar os `default`.

Uma classe abstrata pode ter estado de instância, construtores, métodos `protected`, campos `final` e implementação parcial. Ela não pode ser instanciada, mas suas subclasses compartilham uma base real.

```java
interface Tributavel {
    long impostoCentavos();

    default String resumo() {
        return getClass().getSimpleName() + " -> imposto " + impostoCentavos();
    }
}

abstract class Conta {
    private final long saldoCentavos;

    protected Conta(long saldoCentavos) {
        if (saldoCentavos < 0) throw new IllegalArgumentException("saldo");
        this.saldoCentavos = saldoCentavos;
    }

    public final long getSaldoCentavos() {
        return saldoCentavos;
    }

    public abstract long taxaMensalCentavos();

    public final long saldoAposTaxa() {
        return saldoCentavos - taxaMensalCentavos();
    }
}

final class ContaCorrente extends Conta implements Tributavel {
    ContaCorrente(long saldo) { super(saldo); }
    public long taxaMensalCentavos() { return 1_500; }
    public long impostoCentavos() { return Math.round(getSaldoCentavos() * 0.003); }
}

final class ContaPoupanca extends Conta implements Tributavel {
    ContaPoupanca(long saldo) { super(saldo); }
    public long taxaMensalCentavos() { return 0; }
    public long impostoCentavos() { return 0; }
}

public class Contas {
    public static void main(String[] args) {
        Conta c = new ContaCorrente(100_000);
        System.out.println(c.saldoAposTaxa()); // 98.500
        System.out.println(((Tributavel) c).resumo()); // ContaCorrente -> imposto 300
    }
}
```

`Conta` compartilha estado e um algoritmo (`saldoAposTaxa`) que depende de um passo variável (`taxaMensalCentavos`). Isso é o **Template Method**: a base fixa a ordem, a subclasse fornece o detalhe. `Tributavel` é um contrato ortogonal — qualquer classe pode ser tributável, independentemente da hierarquia.

## Na prática

Interfaces brilham quando o contrato é uma capacidade: `Comparable`, `Runnable`, `AutoCloseable`, `Tributavel`. Uma classe pode implementar várias. Isso permite compor comportamentos sem uma árvore de herança.

Classes abstratas brilham quando há uma base concreta: código comum, campos protegidos, construtores que validam. Um `AbstractService` com template method faz sentido se todas as subclasses realmente compartilham o mesmo esqueleto.

O caso mais delicado é a evolução de interfaces. Adicionar um método abstrato quebra todos os implementadores; adicionar um `default` não quebra, mas pode criar ambiguidade se duas interfaces fornecerem o mesmo método. Nesse caso, a classe é obrigada a resolver explicitamente:

```java
interface Saudacao {
    default String texto() { return "olá"; }
}

interface Despedida {
    default String texto() { return "tchau"; }
}

class Conversa implements Saudacao, Despedida {
    @Override
    public String texto() {
        return Saudacao.super.texto() + " e " + Despedida.super.texto();
    }
}

public class Defaults {
    public static void main(String[] args) {
        System.out.println(new Conversa().texto()); // olá e tchau
    }
}
```

Sem o override, o compilador rejeita `Conversa` por herdar duas implementações conflitantes. A sintaxe `Interface.super.metodo()` só existe para esse caso.

## Armadilhas comuns

- **Usar interface como depósito de constantes.** `interface Config { int TIMEOUT = 30; }` polui o tipo e expõe detalhes. Use uma classe final com construtor privado ou um enum.
- **Adicionar método abstrato a uma interface pública.** Todo implementador externo quebra. Prefira um `default` que lance `UnsupportedOperationException` ou uma nova interface menor.
- **Criar classe abstrata sem estado nem implementação.** Se não há nada concreto, é uma interface com passos extras.
- **Confiar em `default` para herança múltipla de comportamento.** Defaults não têm estado e podem gerar diamantes difíceis de entender.

## Checklist de domínio

- [ ] Você escolhe interface para capacidade e classe abstrata para base parcial
- [ ] Você sabe o que uma interface pode declarar em Java 21
- [ ] Você resolve conflito de `default` com `Interface.super`
- [ ] Você reconhece quando uma hierarquia deve ser substituída por composição

## Para ir além

- [dev.java — Interfaces](https://dev.java/learn/interfaces/): contratos, default methods e evolução.
- [Java Language Specification — Interfaces](https://docs.oracle.com/javase/specs/jls/se21/html/jls-9.html): regras completas de membros e herança.
- [Baeldung — Abstract Classes vs Interfaces](https://www.baeldung.com/java-abstract-class-vs-interface): critérios práticos de escolha.
