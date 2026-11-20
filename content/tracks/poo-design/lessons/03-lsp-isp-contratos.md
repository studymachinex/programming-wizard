> **Em uma frase:** LSP garante que um subtipo possa substituir o pai sem surpresas; ISP garante que ninguém seja obrigado a implementar operações que não usa.

## O problema

A hierarquia parecia natural: `ContaCorrente` e `ContaPoupanca` são contas, então `ContaPoupanca extends ContaCorrente`. O sistema de caixa recebe `Conta` e chama `sacar`. Em homologação, tudo funciona com corrente. Em produção, a primeira poupança chega ao caixa e o fluxo explode com `UnsupportedOperationException`. O código compilou, o `instanceof` não apareceu em lugar nenhum e ninguém entendeu por que o contrato falhou em runtime.

O mesmo padrão aparece com gateways de pagamento que não suportam estorno, repositórios somente leitura que implementam `salvar` vazio e interfaces de serviço com doze métodos em que cada implementação usa três. O compilador valida a forma; não valida a promessa.

## Como funciona

Liskov Substitution Principle diz que, se `S` é subtipo de `T`, um objeto de `S` pode substituir um de `T` sem alterar a correção do programa. Isso é mais forte que "é um". Um quadrado é um retângulo geometricamente, mas não é um retângulo comportamental se o retângulo permite mudar largura e altura independentemente. O subtipo não pode:

- **reforçar pré-condições** — aceitar menos do que o pai aceita;
- **enfraquecer pós-condições** — prometer menos ou devolver algo incompatível;
- **quebrar invariantes** — deixar o objeto em estado que o pai jamais permitiria;
- **lançar exceções novas** para operações que o pai prometia concluir.

A violação clássica é o método herdado que responde com `UnsupportedOperationException`. O cliente conhece a interface `Conta` e tem o direito de chamar `sacar`; o subtipo nega esse direito em runtime. O problema não é a poupança existir, é ela estar no lugar errado da hierarquia.

```java
interface Conta {
    void depositar(double valor);
    void sacar(double valor);
    double saldo();
}

class ContaCorrente implements Conta {
    private double saldo;

    public void depositar(double valor) {
        if (valor <= 0) throw new IllegalArgumentException("valor inválido");
        saldo += valor;
    }

    public void sacar(double valor) {
        if (valor <= 0) throw new IllegalArgumentException("valor inválido");
        if (valor > saldo) throw new IllegalStateException("saldo insuficiente");
        saldo -= valor;
    }

    public double saldo() { return saldo; }
}

class ContaPoupanca extends ContaCorrente {
    @Override
    public void sacar(double valor) {
        // O cliente de Conta não espera esta exceção.
        throw new UnsupportedOperationException("poupança não permite saque imediato");
    }
}

class Caixa {
    void pagar(Conta conta, double valor) {
        conta.sacar(valor);
    }
}
```

`Caixa.pagar` está correto em relação ao contrato de `Conta`. O erro está em `ContaPoupanca` aceitar esse contrato e depois recusá-lo. Se o código tivesse um `if (conta instanceof ContaPoupanca)`, o sintoma estaria apenas mudado de lugar.

A correção é modelar a capacidade, não a entidade. Uma conta que permite saque implementa `ContaComSaque`; uma conta que só recebe depósitos implementa `Conta`. O cliente que precisa sacar declara essa necessidade no tipo:

```java
interface Conta {
    void depositar(double valor);
    double saldo();
}

interface ContaComSaque extends Conta {
    void sacar(double valor);
}

class ContaCorrente implements ContaComSaque {
    private double saldo;

    public void depositar(double valor) {
        if (valor <= 0) throw new IllegalArgumentException("valor inválido");
        saldo += valor;
    }

    public void sacar(double valor) {
        if (valor <= 0) throw new IllegalArgumentException("valor inválido");
        if (valor > saldo) throw new IllegalStateException("saldo insuficiente");
        saldo -= valor;
    }

    public double saldo() { return saldo; }
}

class ContaPoupanca implements Conta {
    private double saldo;

    public void depositar(double valor) {
        if (valor <= 0) throw new IllegalArgumentException("valor inválido");
        saldo += valor;
    }

    public double saldo() { return saldo; }
}

class Caixa {
    void pagar(ContaComSaque conta, double valor) {
        conta.sacar(valor);
    }
}
```

Agora o compilador impede que uma poupança chegue ao caixa. O contrato ficou menor e mais honesto. `ContaPoupanca` pode ganhar rendimento e outras operações sem fingir que saca.

ISP segue a mesma lógica no nível das interfaces. Uma interface gorda obriga implementações a escrever métodos vazios ou lançar exceções — exatamente o cheiro que produz violações de LSP. O erro comum é criar `Repositorio<T>` com `salvar`, `buscar`, `listar`, `exportarCsv` e `arquivar` para "reaproveitar" a interface:

```java
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

record Pedido(String id, double total) {}

interface RepositorioPedido {
    void salvar(Pedido pedido);
    Optional<Pedido> buscar(String id);
    List<Pedido> listar();
    void exportarCsv(Path destino);
}

class RelatorioPedidos {
    private final RepositorioPedido repositorio;

    RelatorioPedidos(RepositorioPedido repositorio) {
        this.repositorio = repositorio;
    }

    List<Pedido> todos() {
        return repositorio.listar();
    }
}
```

O relatório só lê, mas depende de `salvar` e `exportarCsv`. Se ele precisa de um repositório somente leitura para testes, você implementa os métodos que não usa e escolhe entre vazio e exceção. Nenhuma das opções é boa. A correção é dividir por papel de cliente:

```java
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

interface LeitorPedido {
    Optional<Pedido> buscar(String id);
    List<Pedido> listar();
}

interface EscritorPedido {
    void salvar(Pedido pedido);
}

interface ExportadorPedido {
    void exportarCsv(Path destino);
}

class RelatorioPedidos {
    private final LeitorPedido leitor;

    RelatorioPedidos(LeitorPedido leitor) {
        this.leitor = leitor;
    }

    List<Pedido> todos() {
        return leitor.listar();
    }
}
```

Um adapter JPA pode implementar as três interfaces; o relatório depende só de `LeitorPedido`. Em teste, você cria um leitor em memória sem precisar justificar métodos que não existem. Interface segregada não é interface pequena por estética: é interface que corresponde ao que um cliente realmente consome.

## Na prática

Em code review, procure por três sinais: métodos que lançam `UnsupportedOperationException`, implementações com corpo vazio e `default` que só existe para evitar erro de compilação. Os três indicam que a interface promete mais do que alguns implementadores conseguem entregar.

Há uma nuance importante: a biblioteca padrão do Java tem listas não modificáveis que lançam exceção em `add`. Isso é aceitável no contrato de `List` porque as operações de mutação são documentadas como opcionais. Em código de domínio, porém, "opcional" raramente é um contrato útil: o cliente não sabe se pode chamar sem consultar documentação. Prefira tipos separados.

E quando **não** dividir? Se todos os clientes usam todos os métodos e existe uma única implementação real, uma interface gorda pode ser apenas uma interface grande. ISP não é sobre contar métodos; é sobre clientes forçados a depender do que não usam. Dividir antes de existir o segundo cliente pode criar cerimônia e dificultar a navegação.

## Armadilhas comuns

- **Usar herança para reutilizar código, não para substituir contrato.** `ContaPoupanca extends ContaCorrente` economiza linhas e cria um subtipo que não pode fazer tudo. Prefira composição quando a relação não é de contrato.
- **Tratar `instanceof` como solução.** Um `if` no cliente revela que a abstração não cobre a variação; mover o `if` para um helper só disfarça.
- **Colocar validação mais rígida no subtipo.** Rejeitar valores que o pai aceita é violação de LSP, mesmo que a intenção seja "proteger o domínio".
- **Confundir ISP com uma interface por classe.** O corte é por cliente e por capacidade, não por implementação.

## Checklist de domínio

- [ ] Você identifica pré-condições, pós-condições e invariantes de uma hierarquia
- [ ] Você reconhece um subtipo que não pode substituir o pai e propõe uma modelagem alternativa
- [ ] Você divide uma interface gorda por papel de cliente
- [ ] Você explica por que `UnsupportedOperationException` em código de domínio é um cheiro

## Para ir além

- [Liskov Substitution Principle](https://www.baeldung.com/java-liskov-substitution-principle) — exemplos de contrato e subtipos problemáticos.
- [Interface Segregation Principle](https://www.baeldung.com/java-interface-segregation-principle) — interfaces por cliente, com código Java.
- [SOLID Principles](https://www.baeldung.com/solid-principles) — visão integrada dos cinco princípios e como eles se sustentam.
