> **Em uma frase:** Classe é o molde, objeto é a instância com identidade e estado, e o construtor é o único lugar em que você pode garantir que nenhum objeto inválido nasça.

## O problema

Uma `Conta` era criada com saldo zero, recebia um depósito e só então tinha o CPF validado. Entre a criação e a validação, existia um objeto com estado impossível. Um job assíncrono pegou essa conta no meio do caminho, gerou um boleto e enviou para um CPF em branco.

O problema não foi o job. Foi permitir que um objeto inválido existisse. Se toda criação passa pelo construtor e o construtor valida, esse intervalo não existe. É a diferença entre uma classe que representa um conceito e uma estrutura de dados que qualquer um monta como quiser.

## Como funciona

Uma classe declara estado (campos) e comportamento (métodos). Um objeto é uma instância alocada no heap, acessada por uma referência. Duas variáveis podem apontar para o mesmo objeto; nesse caso, alterar o estado por uma é visível pela outra.

Campos de instância recebem valores padrão: `0`, `false`, `null`. Variáveis locais não; o compilador exige inicialização. Essa diferença explica por que um campo `String nome` começa nulo sem aviso, enquanto `String nome;` dentro de um método não compila se usada antes de atribuir.

```java
public class Conta {
    private final String titular;
    private final String cpf;
    private long saldoCentavos;

    public Conta(String titular, String cpf) {
        this(titular, cpf, 0L);
    }

    public Conta(String titular, String cpf, long saldoInicialCentavos) {
        if (titular == null || titular.isBlank()) {
            throw new IllegalArgumentException("titular obrigatório");
        }
        if (cpf == null || !cpf.matches("\\d{11}")) {
            throw new IllegalArgumentException("CPF deve ter 11 dígitos");
        }
        if (saldoInicialCentavos < 0) {
            throw new IllegalArgumentException("saldo inicial não pode ser negativo");
        }
        this.titular = titular.trim();
        this.cpf = cpf;
        this.saldoCentavos = saldoInicialCentavos;
    }

    public long getSaldoCentavos() {
        return saldoCentavos;
    }

    public static void main(String[] args) {
        Conta c = new Conta("Ana", "12345678901", 5_000);
        System.out.println(c.getSaldoCentavos()); // 5000
    }
}
```

O primeiro construtor delega ao segundo com `this(...)`. A delegação precisa ser a primeira instrução. Isso evita duplicar validação e mantém um único caminho de inicialização.

O construtor não tem tipo de retorno, nem `void`. Se você escrever `public void Conta()`, isso é um método comum, não um construtor, e a classe ganha também o construtor padrão. O compilador só gera o construtor sem argumentos quando nenhum outro é declarado. Ao adicionar `Conta(String, String)`, código antigo que fazia `new Conta()` para de compilar — o que é bom, porque força a revisão dos pontos de criação.

## Na prática

Construtores funcionam bem quando a criação é simples. Quando há muitas variações, nomes claros ajudam mais que uma lista de parâmetros. Factory methods estáticos comunicam a intenção:

```java
public final class Dinheiro {
    private final long centavos;

    private Dinheiro(long centavos) {
        this.centavos = centavos;
    }

    public static Dinheiro deReais(long reais, int centavos) {
        if (reais < 0 || centavos < 0 || centavos > 99) {
            throw new IllegalArgumentException("valor inválido");
        }
        return new Dinheiro(reais * 100 + centavos);
    }

    public static Dinheiro deCentavos(long centavos) {
        if (centavos < 0) throw new IllegalArgumentException("valor negativo");
        return new Dinheiro(centavos);
    }

    public Dinheiro somar(Dinheiro outro) {
        return new Dinheiro(Math.addExact(this.centavos, outro.centavos));
    }

    @Override
    public String toString() {
        return "R$ %d,%02d".formatted(centavos / 100, centavos % 100);
    }

    public static void main(String[] args) {
        Dinheiro a = Dinheiro.deReais(19, 90);
        Dinheiro b = Dinheiro.deCentavos(10);
        System.out.println(a.somar(b)); // R$ 20,00
    }
}
```

A classe é `final`, o campo é `final` e o construtor é privado. Isso torna `Dinheiro` imutável: toda operação devolve uma nova instância. Imutabilidade elimina uma classe inteira de bugs de aliasing e é a base de value objects bem modelados.

Um detalhe de produção: não chame métodos sobrescrevíveis dentro de um construtor. Se a subclasse ainda não inicializou seus campos, o método dinâmico pode acessar `null` ou `0`. Construa o estado primeiro; valide com métodos `private` ou `final`.

## Armadilhas comuns

- **Validar depois da construção.** Se existe um setter que permite estado inválido, a invariante não existe. Valide no construtor e nos métodos de mutação.
- **Expor `this` antes de terminar o construtor.** Registrar o objeto em um listener ou cache dentro do construtor permite que outra thread veja estado incompleto.
- **Confundir identidade com igualdade.** `new Conta("Ana", cpf)` duas vezes cria objetos diferentes. Sem `equals`, `==` compara referências.
- **Usar construtor gigante com booleanos.** `new Pedido(true, false, true)` não é legível. Prefira factories nomeadas ou um builder quando os parâmetros passarem de quatro.

## Checklist de domínio

- [ ] Você explica a diferença entre referência, objeto e estado
- [ ] Você escreve construtores que rejeitam dados inválidos
- [ ] Você sabe quando o construtor padrão deixa de existir
- [ ] Você reconhece quando um factory method comunica melhor que `new`

## Para ir além

- [dev.java — Creating Classes](https://dev.java/learn/classes-objects/creating-classes/): campos, construtores e métodos.
- [Java Language Specification — Constructors](https://docs.oracle.com/javase/specs/jls/se21/html/jls-8.html#jls-8.8): regras de `this(...)`, `super(...)` e inicialização.
- [Effective Java — Creating and Destroying Objects](https://www.oreilly.com/library/view/effective-java-3rd/9780134686097/): factories, builders e imutabilidade.
