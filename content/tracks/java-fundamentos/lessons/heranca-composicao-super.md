> **Em uma frase:** Herança só se justifica quando existe uma relação "é um" com contrato estável; quando o objetivo é reaproveitar código, composição quase sempre envelhece melhor.

## O problema

Uma classe `RelatorioPdf extends Relatorio` herdou de `Relatorio` para reaproveitar o método `formatarCabecalho()`. Meses depois, `Relatorio` ganhou um campo `usuario` e um método `enviarPorEmail()` que `RelatorioPdf` não deveria ter. A subclasse passou a carregar comportamento sem sentido e, pior, qualquer mudança na base podia quebrar seu funcionamento interno.

Esse é o **fragile base class problem**: a subclasse depende de detalhes de implementação da superclasse, não só do contrato. Herança é o acoplamento mais forte que Java oferece entre duas classes. Usar para "economizar linhas" é uma troca ruim.

## Como funciona

Java permite herdar de uma única classe, mas implementar várias interfaces. Toda classe herda de `Object`, direta ou indiretamente. A subclasse acessa membros `public` e `protected`; membros `private` existem no objeto, mas não são acessíveis pelo nome.

A ordem de inicialização é rígida: construtor da superclasse, depois campos da subclasse, depois corpo do construtor da subclasse. Se você não chama `super(...)`, o compilador insere `super()` sem argumentos. Se a superclasse não tem esse construtor, a compilação falha.

```java
public class Funcionarios {
    static class Funcionario {
        private final String nome;
        private final long salarioBase;

        Funcionario(String nome, long salarioBase) {
            if (nome == null || nome.isBlank()) throw new IllegalArgumentException("nome");
            if (salarioBase <= 0) throw new IllegalArgumentException("salário");
            this.nome = nome;
            this.salarioBase = salarioBase;
        }

        long salario() {
            return salarioBase;
        }

        String descricao() {
            return nome + " recebe " + salario();
        }
    }

    static final class Gerente extends Funcionario {
        private final long bonus;

        Gerente(String nome, long salarioBase, long bonus) {
            super(nome, salarioBase); // primeiro
            if (bonus < 0) throw new IllegalArgumentException("bônus");
            this.bonus = bonus;
        }

        @Override
        long salario() {
            return super.salario() + bonus;
        }
    }

    public static void main(String[] args) {
        Funcionario f = new Gerente("Ana", 8_000_00, 2_000_00);
        System.out.println(f.descricao()); // Ana recebe 1000000
        System.out.println(f.salario());   // 1000000
    }
}
```

`Gerente` é um `Funcionario` de verdade: tem nome, salário base e pode ser tratado pela mesma interface. O polimorfismo faz `f.salario()` chamar a versão do gerente mesmo com a variável tipada como `Funcionario`.

Use `protected` com parcimônia. Ele expõe um membro para qualquer subclasse, inclusive de outro pacote, e vira parte do contrato. Prefira `private` e métodos `final` que definem pontos de extensão claros.

## Na prática

Composição troca "é um" por "tem um" e permite trocar o colaborador em runtime ou em teste. Em vez de `RelatorioPdf extends Relatorio`, você tem `Relatorio` com um `Formatador` injetado.

```java
public class Pedidos {
    interface Notificador {
        void enviar(String destino, String mensagem);
    }

    static final class EmailNotificador implements Notificador {
        public void enviar(String destino, String mensagem) {
            System.out.println("EMAIL para " + destino + ": " + mensagem);
        }
    }

    static final class SmsNotificador implements Notificador {
        public void enviar(String destino, String mensagem) {
            System.out.println("SMS para " + destino + ": " + mensagem.substring(0, 20));
        }
    }

    static final class Pedido {
        private final String cliente;
        private final Notificador notificador;

        Pedido(String cliente, Notificador notificador) {
            this.cliente = cliente;
            this.notificador = notificador;
        }

        void finalizar() {
            notificador.enviar(cliente, "Seu pedido foi confirmado");
        }
    }

    public static void main(String[] args) {
        new Pedido("ana@exemplo.com", new EmailNotificador()).finalizar();
        new Pedido("+5511999999999", new SmsNotificador()).finalizar();
    }
}
```

O `Pedido` não sabe se a notificação é e-mail ou SMS. Ele depende de um contrato pequeno. Isso facilita testar com um `Notificador` falso, trocar o canal e evoluir cada implementação separadamente.

O princípio de substituição de Liskov é o teste da herança: se `Gerente` fosse usado no lugar de `Funcionario` e `salario()` violasse alguma expectativa (por exemplo, devolvesse valor negativo), a hierarquia estaria errada. Subclasses não devem reforçar pré-condições nem enfraquecer pós-condições.

## Armadilhas comuns

- **Herdar só para reutilizar métodos.** Se não há "é um", use composição. Herança cria acoplamento a mudanças da base.
- **Chamar método sobrescrevível no construtor.** A subclasse ainda não inicializou seus campos; o método dinâmico pode ver `null` ou zero. Torne o método `final` ou chame só `private`.
- **Esquecer `super(...)` quando a base não tem construtor padrão.** O compilador tenta `super()` e falha. Chame explicitamente o construtor correto na primeira linha.
- **Usar `protected` como atalho.** Ele vaza implementação e dificulta refatorar a base. Prefira composição com interfaces.

## Checklist de domínio

- [ ] Você justifica uma hierarquia com "é um" e um contrato, não com conveniência
- [ ] Você explica a ordem de inicialização de superclasse e subclasse
- [ ] Você troca um caso claro de herança por composição
- [ ] Você reconhece uma violação de Liskov em um override

## Para ir além

- [dev.java — Inheritance](https://dev.java/learn/classes-objects/inheritance/): `extends`, `super` e sobrescrita.
- [Java Language Specification — Inheritance](https://docs.oracle.com/javase/specs/jls/se21/html/jls-8.html#jls-8.1.4): regras de acesso e construtores.
- [Baeldung — Composition vs Inheritance](https://www.baeldung.com/java-inheritance-composition): critérios e exemplos de refatoração.
