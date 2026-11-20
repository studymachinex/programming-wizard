> **Em uma frase:** Encapsular é impedir que o estado interno seja alterado fora das regras do objeto; getters e setters automáticos apenas trocam a forma de violar essas regras.

## O problema

Uma classe `Carrinho` tinha `private List<Item> itens` e um getter `getItens()`. O código parecia encapsulado: o campo era privado. Mas o getter devolvia a lista real. Um serviço fazia `carrinho.getItens().clear()` para "recalcular" o carrinho, pulando a validação de estoque e os eventos de domínio.

Outro caso: `getDataNascimento()` devolvia um `java.util.Date`. O chamador fazia `setTime(...)` e mudava a data de nascimento de um cliente sem passar por nenhuma regra. O campo era privado; o estado, não.

## Como funciona

Encapsulamento tem três partes: esconder a representação, controlar as transições de estado e expor apenas operações que façam sentido no domínio. Getters e setters são consequência, não definição.

A primera decisão é o que expor. Se o chamador precisa saber o saldo, um `getSaldo()` é razoável. Se ele precisa alterar o saldo, provavelmente a operação correta é `sacar(valor)` ou `depositar(valor)`, porque essas operações carregam regras.

```java
import java.util.ArrayList;
import java.util.List;

public class ContaBancaria {
    private long saldoCentavos;
    private final List<String> historico = new ArrayList<>();

    public ContaBancaria(long saldoInicialCentavos) {
        if (saldoInicialCentavos < 0) throw new IllegalArgumentException("saldo negativo");
        this.saldoCentavos = saldoInicialCentavos;
    }

    public void depositar(long valorCentavos) {
        if (valorCentavos <= 0) throw new IllegalArgumentException("depósito deve ser positivo");
        saldoCentavos = Math.addExact(saldoCentavos, valorCentavos);
        historico.add("DEPOSITO " + valorCentavos);
    }

    public void sacar(long valorCentavos) {
        if (valorCentavos <= 0) throw new IllegalArgumentException("saque deve ser positivo");
        if (valorCentavos > saldoCentavos) throw new IllegalStateException("saldo insuficiente");
        saldoCentavos -= valorCentavos;
        historico.add("SAQUE " + valorCentavos);
    }

    public long getSaldoCentavos() {
        return saldoCentavos;
    }

    public List<String> getHistorico() {
        return List.copyOf(historico); // cópia imutável
    }

    public static void main(String[] args) {
        ContaBancaria c = new ContaBancaria(10_000);
        c.sacar(2_500);
        System.out.println(c.getSaldoCentavos()); // 7500
        System.out.println(c.getHistorico());     // [SAQUE 2500]
    }
}
```

`List.copyOf` cria uma lista imutável com os elementos atuais. O chamador não consegue adicionar nem remover itens, e alterações futuras na conta não aparecem na cópia. Se a lista fosse devolvida diretamente, o histórico poderia ser adulterado.

## Na prática

Cópia defensiva é obrigatória para qualquer tipo mutável que atravesse a fronteira do objeto: `List`, `Map`, arrays, `Date`, `StringBuilder`. Tipos imutáveis como `String`, `Integer` e `LocalDate` podem ser devolvidos sem cópia.

```java
import java.time.LocalDate;
import java.time.Period;

public final class Periodo {
    private final LocalDate inicio;
    private final LocalDate fim;

    public Periodo(LocalDate inicio, LocalDate fim) {
        if (inicio == null || fim == null) throw new IllegalArgumentException("datas obrigatórias");
        if (fim.isBefore(inicio)) throw new IllegalArgumentException("fim antes do início");
        this.inicio = inicio;
        this.fim = fim;
    }

    public boolean contem(LocalDate data) {
        return !data.isBefore(inicio) && !data.isAfter(fim);
    }

    public int dias() {
        return Period.between(inicio, fim).getDays();
    }

    public static void main(String[] args) {
        Periodo p = new Periodo(LocalDate.of(2024, 1, 1), LocalDate.of(2024, 1, 31));
        System.out.println(p.contem(LocalDate.of(2024, 1, 15))); // true
        System.out.println(p.dias()); // 30
    }
}
```

O método `contem` é um exemplo de **Tell, Don't Ask**: você não pega `inicio` e `fim` para comparar fora; você diz ao período para responder. Isso mantém a regra em um único lugar e reduz o acoplamento.

Em APIs públicas, prefira tipos de retorno imutáveis. `List<String>` devolvido como `List.copyOf` é melhor que `ArrayList`. Um `Optional` pode comunicar ausência, mas não deve ser usado como campo. Em DTOs de entrada, aceite a estrutura necessária e converta para o modelo de domínio na borda.

## Armadilhas comuns

- **Getter que devolve a coleção interna.** É o vazamento mais comum em código Java. Use `List.copyOf`, `Collections.unmodifiableList` ou devolva um stream.
- **Record com campo mutável.** `record Turma(List<Aluno> alunos)` é imutável na referência, não na lista. No construtor compacto, faça `alunos = List.copyOf(alunos)`.
- **Setter para tudo.** Um setter público é uma porta aberta para qualquer estado, a qualquer momento. Crie métodos de domínio com nomes que expressem a transição.
- **Confundir `final` com imutabilidade.** Um campo `final List` não pode ser reatribuído, mas o conteúdo continua mutável.

## Checklist de domínio

- [ ] Você identifica vazamentos de estado em getters de coleção e data
- [ ] Você aplica cópia defensiva no construtor e no getter
- [ ] Você modela operações (`sacar`, `contem`) em vez de expor campos
- [ ] Você sabe a diferença entre referência final e objeto imutável

## Para ir além

- [dev.java — Objects](https://dev.java/learn/classes-objects/): criação, referências e ciclo de vida.
- [Baeldung — Defensive Copy in Java](https://www.baeldung.com/java-defensive-copy): exemplos com coleções, arrays e datas.
- [Martin Fowler — Tell, Don't Ask](https://martinfowler.com/bliki/TellDontAsk.html): por que comportamento deve morar no objeto.
