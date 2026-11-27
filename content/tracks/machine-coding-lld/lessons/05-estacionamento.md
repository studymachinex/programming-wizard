> **Em uma frase:** o estacionamento é o LLD mais pedido porque testa tudo de uma vez: modelagem de domínio, alocação eficiente, regra de negócio plugável e erros tratados, e o entrevistador quer o código rodando.

## O problema

"Desenhe um estacionamento" já foi uma pergunta de diagrama UML. Hoje, em machine coding, a frase vem com "running code, not a diagram". Você tem uns 60 minutos para entregar um sistema que aloca vagas de tamanhos diferentes, emite tickets, cobra na saída e aguenta as extensões: carro elétrico com carregador, mensalista, várias cancelas ao mesmo tempo.

As respostas fracas têm um padrão: uma lista de `Vaga` percorrida inteira a cada entrada, `if (tipo == CARRO) ... else if (tipo == MOTO)` espalhado em cinco lugares e preço calculado dentro do `sair()`.

## Como funciona

### Requisitos fechados em 5 minutos

Pergunte e anote: há andares? Quais tamanhos de vaga? Veículo pequeno pode usar vaga grande? Como se cobra (hora, fração, diária)? Existe tolerância? Pagamento está no escopo? A resposta típica vira o contrato do exercício desta aula: três tamanhos, veículo cabe em vaga igual ou maior, menor vaga compatível primeiro, cobrança por hora iniciada com 15 minutos grátis.

### Modelo: o que varia vira interface

| Conceito | Tipo | Por quê |
|---|---|---|
| `TamanhoVaga`, `TipoVeiculo` | enum | Conjunto fechado, sem comportamento próprio |
| `Ticket` | record | Dado imutável emitido na entrada |
| `Tarifa` | interface | Varia: por hora, diária, mensalista, evento |
| `Estacionamento` | classe | Orquestra alocação e saída |

O `TipoVeiculo` carrega o tamanho mínimo que exige. Isso tira o `if` por tipo de veículo do código de alocação:

```java
enum TamanhoVaga { MOTO, CARRO, GRANDE } // ordem crescente: ordinal() compara tamanho

enum TipoVeiculo {
    MOTO(TamanhoVaga.MOTO), CARRO(TamanhoVaga.CARRO), VAN(TamanhoVaga.GRANDE);
    final TamanhoVaga minimo;
    TipoVeiculo(TamanhoVaga minimo) { this.minimo = minimo; }
}
```

### Alocação em O(log n), não O(n)

Um prédio com 10 andares e 500 vagas por andar tem 5.000 vagas. Varrer todas a cada entrada funciona, mas o entrevistador vai perguntar. A estrutura certa é um **`TreeSet` de vagas livres por tamanho**, ordenado por (andar, índice). `pollFirst()` entrega a melhor vaga em O(log n), e devolver a vaga na saída é um `add`.

```java
import java.util.*;

class Alocador {
    record Vaga(int andar, int indice, TamanhoVaga tamanho) {
        String id() { return andar + "-" + tamanho + "-" + indice; }
    }

    private final Map<TamanhoVaga, TreeSet<Vaga>> livres = new EnumMap<>(TamanhoVaga.class);

    Alocador() {
        Comparator<Vaga> ordem = Comparator.comparingInt(Vaga::andar).thenComparingInt(Vaga::indice);
        for (TamanhoVaga t : TamanhoVaga.values()) livres.put(t, new TreeSet<>(ordem));
    }

    Optional<Vaga> alocar(TipoVeiculo tipo) {
        for (TamanhoVaga t : TamanhoVaga.values()) {           // do menor para o maior
            if (t.ordinal() < tipo.minimo.ordinal()) continue; // não cabe
            Vaga v = livres.get(t).pollFirst();                // O(log n)
            if (v != null) return Optional.of(v);
        }
        return Optional.empty();
    }

    void liberar(Vaga v) { livres.get(v.tamanho()).add(v); }
}
```

### A tarifa é uma Strategy

O `Estacionamento` chama `tarifa.calcularCentavos(duracao, tamanhoDaVaga)` e não sabe mais nada. A regra de 15 minutos de tolerância e hora iniciada mora em `TarifaPorHora`. Quando o entrevistador pedir "agora domingo é diária fixa", você escreve uma classe nova ou até uma lambda, porque `Tarifa` é uma interface funcional.

## Na prática

- **Quem paga é a vaga, não o veículo.** Uma moto numa vaga de carro ocupa uma vaga de carro. Diga qual regra escolheu: é uma decisão de negócio, não técnica.
- **Placa como chave de unicidade.** Um mapa `placa -> ticket` impede o mesmo carro de entrar duas vezes (erro de leitura da câmera, clonagem de placa) e responde "onde está meu carro" em O(1).
- **Ticket encerrado não volta.** Remova-o dos ativos na saída. Se o requisito pedir histórico, mova-o para outro repositório, em vez de usar uma flag `pago` que todo método precisa conferir.
- **Extensão de carregador elétrico.** Vira um atributo da vaga e um critério extra na escolha. A forma limpa é um `TreeSet` por (tamanho, temElétrico), sem mexer na `Tarifa`.
- **Várias cancelas.** `entrar` e `sair` passam a ser concorrentes. A solução simples é `synchronized` nos dois. A escalável é lock por tamanho de vaga, com `ConcurrentSkipListSet` no lugar do `TreeSet`, que tem `pollFirst()` atômico.

## Armadilhas comuns

- **Hierarquia `Veiculo` com `Carro`, `Moto` e `Van` sem comportamento diferente.** Se as subclasses só existem para retornar um tamanho, um enum resolve. Herança aqui é cerimônia.
- **Calcular horas com `double` e `Math.ceil`.** Use `(duracao + HORA - 1) / HORA` em `long`. Fica exato e sem conversão.
- **Esquecer a tolerância no limite.** Exatamente 15 minutos é grátis ou pago? Escolha, escreva na regra e teste o milissegundo seguinte.
- **Id de ticket aleatório em teste.** `UUID.randomUUID()` torna os testes não determinísticos. Use sequência injetável ou contador.

## Checklist de domínio

- [ ] Você fecha os requisitos do estacionamento em 5 minutos de perguntas
- [ ] Você aloca vagas em O(log n) com um conjunto ordenado por tamanho
- [ ] Você troca a regra de preço sem tocar no `Estacionamento`
- [ ] Você sabe dizer o que muda para suportar várias cancelas

## Para ir além

- [Awesome LLD: Parking Lot](https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/parking-lot.md): requisitos e uma solução de referência para comparar.
- [Javadoc de ConcurrentSkipListSet (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentSkipListSet.html): o `TreeSet` concorrente para a extensão de várias cancelas.
- [LeetCode 1603: Design Parking System](https://leetcode.com/problems/design-parking-system/): a versão mínima, boa para aquecer.
