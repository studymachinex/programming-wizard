> **Em uma frase:** saga coordena o que não pode ser transacional; CQRS separa leitura de escrita; event sourcing guarda a história — juntos, resolvem muito e cobram caro em complexidade.

Saga já apareceu no módulo de consistência. Aqui o foco é a combinação com CQRS e event sourcing: quando o evento é a fonte da verdade, como projetar leituras e como não criar um sistema impossível de evoluir.

## O problema

Um domínio financeiro precisa de auditoria completa e consultas por vários ângulos. Atualizar várias tabelas na mesma transação funciona até o volume crescer e os relatórios competirem com escritas. Guardar só o estado atual perde a história; guardar tudo em uma tabela de auditoria não reconstrói o estado de forma barata.

## Como funciona

**Event sourcing:** o estado é derivado de uma sequência de eventos. O agregado aplica eventos e mantém a versão. Para reconstruir, replayed. Snapshots aceleram.

```java
sealed interface EventoConta permits Depositado, Sacado {}
record Depositado(BigDecimal valor, Instant quando) implements EventoConta {}
record Sacado(BigDecimal valor, Instant quando) implements EventoConta {}

final class Conta {
    private BigDecimal saldo = BigDecimal.ZERO;
    private long versao = 0;

    void aplicar(EventoConta e) {
        switch (e) {
            case Depositado d -> saldo = saldo.add(d.valor());
            case Sacado s -> saldo = saldo.subtract(s.valor());
        }
        versao++;
    }

    static Conta reconstruir(List<EventoConta> eventos) {
        var c = new Conta();
        eventos.forEach(c::aplicar);
        return c;
    }
}
```

**CQRS:** escrita grava eventos; projeções mantêm read models otimizados. A consistência entre eles é eventual. Não use CQRS se o mesmo modelo serve leitura e escrita.

**Saga:** coordena passos entre agregados/serviços, com compensação. Event sourcing e saga se combinam: cada passo publica eventos; o coordenador reage.

## Na prática

Comece por auditoria e outbox; evolua para event sourcing só quando a história for requisito. Projeções precisam ser idempotentes e reconstruíveis. Versione eventos e mantenha upcasters.

Snapshots a cada N eventos evitam replay longo. Battery de testes: reconstruir de eventos deve produzir o mesmo estado.

## Armadilhas comuns

- Event sourcing para CRUD simples.
- Projeção não idempotente.
- Replay sem versionamento.
- Ler read model imediatamente após escrever e assumir consistência forte.
- Saga e event sourcing sem observabilidade.

## Checklist de domínio

- [ ] Sei quando event sourcing paga o custo.
- [ ] Implemento agregado e replay.
- [ ] Separo read model e escrita.
- [ ] Projeções são idempotentes.
- [ ] Versiono eventos e uso snapshots.

## Para ir além

Leia os artigos de CQRS e event sourcing de Martin Fowler e o padrão saga de microservices.io. Depois implemente uma conta com replay e uma projeção.
