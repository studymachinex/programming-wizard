> **Em uma frase:** Adapter traduz um contrato incompatível; Decorator mantém o contrato e empilha comportamento — os dois usam composição, mas resolvem problemas diferentes.

## O problema

O checkout novo fala `GatewayPagamento`, mas a adquirente legada expõe `CobrancaLegada.efetuar(String cpf, int centavos)`. A primeira tentativa é chamar o legado direto no caso de uso. Em pouco tempo, `String cpf`, `int centavos` e o booleano ambíguo do legado aparecem em cinco classes do domínio. Trocar de adquirente vira uma cirurgia.

O segundo problema é transversal. O envio de e-mail precisa de log, retry e métrica. A classe `EmailNotificador` começa a ganhar `if (tentativa < 3)`, `log.info`, `metric.increment`. Cada nova preocupação modifica a mesma classe e exige testar o envio de novo. São dois problemas de composição: adaptar interface e adicionar comportamento.

## Como funciona

**Adapter** converte a interface de uma classe existente para a interface que o cliente espera. Ele não muda o comportamento do adaptado; traduz tipos, unidades e semântica. É a camada de proteção entre seu domínio e uma API legada ou de terceiro.

```java
record Cobranca(String documento, long centavos) {}
record Recibo(String id, boolean aprovado) {}

interface GatewayPagamento {
    Recibo cobrar(Cobranca cobranca);
}

class CobrancaLegada {
    boolean efetuar(String cpf, int valorEmCentavos) {
        // Regra e efeitos do sistema antigo.
        return valorEmCentavos > 0;
    }
}

class GatewayLegadoAdapter implements GatewayPagamento {
    private final CobrancaLegada legado;

    GatewayLegadoAdapter(CobrancaLegada legado) {
        this.legado = legado;
    }

    @Override
    public Recibo cobrar(Cobranca cobranca) {
        int centavos = Math.toIntExact(cobranca.centavos());
        boolean ok = legado.efetuar(cobranca.documento(), centavos);
        return new Recibo("LEG-" + cobranca.documento(), ok);
    }
}
```

O domínio agora depende de `GatewayPagamento`, não de `CobrancaLegada`. O adapter concentra a tradução e o risco de overflow de `long` para `int`. Se o legado mudar, a mudança fica contida nele.

**Decorator** implementa a mesma interface do componente que envolve e delega a chamada, adicionando comportamento antes ou depois. O cliente não sabe quantas camadas existem. É diferente de herança: você compõe em runtime e pode variar a combinação por configuração ou teste.

```java
interface Notificador {
    void enviar(String destino, String mensagem);
}

class EmailNotificador implements Notificador {
    public void enviar(String destino, String mensagem) {
        System.out.println("EMAIL " + destino + ": " + mensagem);
    }
}

class NotificadorComLog implements Notificador {
    private final Notificador proximo;

    NotificadorComLog(Notificador proximo) {
        this.proximo = proximo;
    }

    public void enviar(String destino, String mensagem) {
        System.out.println("log: enviando para " + destino);
        proximo.enviar(destino, mensagem);
    }
}

class NotificadorComRetry implements Notificador {
    private final Notificador proximo;
    private final int tentativas;

    NotificadorComRetry(Notificador proximo, int tentativas) {
        this.proximo = proximo;
        this.tentativas = tentativas;
    }

    public void enviar(String destino, String mensagem) {
        RuntimeException ultima = null;
        for (int i = 1; i <= tentativas; i++) {
            try {
                proximo.enviar(destino, mensagem);
                return;
            } catch (RuntimeException e) {
                ultima = e;
            }
        }
        throw ultima;
    }
}

class NotificadorComMetrica implements Notificador {
    private final Notificador proximo;
    private final java.util.concurrent.atomic.AtomicInteger total = new java.util.concurrent.atomic.AtomicInteger();

    NotificadorComMetrica(Notificador proximo) {
        this.proximo = proximo;
    }

    public void enviar(String destino, String mensagem) {
        total.incrementAndGet();
        proximo.enviar(destino, mensagem);
    }

    int total() { return total.get(); }
}
```

A composição decide a ordem:

```java
Notificador notificador = new NotificadorComMetrica(
        new NotificadorComLog(
                new NotificadorComRetry(new EmailNotificador(), 3)));
```

Aqui a métrica conta uma operação lógica, o log registra uma tentativa de envio e o retry tenta três vezes. Se você inverter log e retry, o log passa a registrar cada tentativa. Nenhuma das duas ordens é "certa" universalmente; a semântica que você quer define a ordem.

## Na prática

Adapter é a escolha certa na borda com sistemas de terceiros: SDKs de pagamento, ERPs, APIs de governo, bibliotecas antigas. Ele também serve como anti-corruption layer: o domínio não deve importar classes do fornecedor. O adapter traduz exceções, códigos e tipos. Um erro comum é vazar a semântica do legado — por exemplo, retornar `boolean` sem explicar se `false` significa recusa, erro de rede ou timeout. O contrato novo precisa ser mais expressivo que o antigo, não uma cópia.

Decorator é ideal para preocupações ortogonais: log, métricas, cache, retry, autorização, compressão. Java I/O é o exemplo canônico (`BufferedReader` em volta de `FileReader`), mas o padrão aparece em filtros HTTP e proxies de framework. O custo é a pilha de wrappers: stack traces mais profundos, ordem que importa e dificuldade de saber qual camada lançou a exceção. Em produção, nomeie as camadas e mantenha a composição em um único ponto.

O detalhe mais perigoso é retry. Repetir automaticamente uma cobrança, um `POST` ou qualquer operação não idempotente pode duplicar o efeito. Retry deve ser aplicado só a operações idempotentes ou acompanhado de chave de idempotência. Também não faz sentido repetir erros de validação (4xx); nesse caso, o decorator precisa distinguir falhas transitórias de definitivas.

E quando **não** usar? Adapter não conserta um legado ruim; ele contém o dano. Se a integração é simples e o tipo do fornecedor já é estável, um adapter pode ser uma camada extra sem retorno. Decorator não compensa quando o comportamento é fixo e único: um método privado ou uma estratégia explícita é mais legível. E não empilhe decorators para esconder um design confuso; se o fluxo tem cinco wrappers, talvez falte um componente que orquestre o processo.

## Armadilhas comuns

- **Adapter que vaza tipos do legado.** Se o domínio recebe `CobrancaLegada` ou `boolean` sem significado claro, a fronteira não existe.
- **Decorator que engole exceções.** Um retry que captura tudo, inclusive `IllegalArgumentException`, transforma erro de programação em tentativa inútil.
- **Ordem acidental.** Métrica dentro do retry conta tentativas; fora, conta operações. Documente e teste a composição.
- **Herança em vez de composição.** Criar `EmailComLogComRetry` explode em subclasses. Decorator resolve isso com objetos pequenos.

## Checklist de domínio

- [ ] Você diferencia conversão de interface de adição de comportamento
- [ ] Você adapta um legado sem expor seus tipos ao domínio
- [ ] Você compõe log, métrica e retry na ordem que reflete a semântica
- [ ] Você sabe quando a indireção não paga o custo

## Para ir além

- [Adapter](https://refactoring.guru/design-patterns/adapter) — estrutura, variantes de classe e objeto.
- [Decorator](https://refactoring.guru/design-patterns/decorator) — composição dinâmica e relação com herança.
- [Adapter em Java](https://www.baeldung.com/java-adapter-pattern) — exemplo completo com integração legada.
- [Decorator em Java](https://www.baeldung.com/java-decorator-pattern) — implementação e casos de uso.
