> **Em uma frase:** SRP separa o que muda por motivos diferentes; OCP permite acrescentar variações sem reabrir o cálculo que já funciona.

## O problema

O cálculo de desconto é um dos lugares onde mais se concentra dívida de design. Começa simples: cliente regular não tem desconto, VIP tem 15%, parceiro tem 10%. Três meses depois, o comercial pede desconto para estudante. Depois, desconto progressivo acima de R$ 500. Depois, cupom que acumula com o desconto do cliente. Cada pedido vira um `case` novo no mesmo `switch`, e cada alteração exige recompilar, revisar e testar o arquivo inteiro — inclusive regras que não mudaram.

O sintoma não é o `switch` em si. É a combinação de três decisões escondidas no mesmo método: **qual regra se aplica**, **como calcular o desconto** e **o que fazer com o resultado** (auditar, persistir, notificar). São três motivos de mudança. SRP manda separá-los; OCP manda permitir que a quarta regra entre sem editar a lógica das três primeiras.

## Como funciona

SRP não significa "um método por classe". Significa que uma classe deve ter uma única razão para ser modificada, normalmente ligada a um grupo de stakeholders. `PoliticaDesconto` responde ao comercial; `Auditoria` responde ao financeiro; `PedidoRepository` responde à operação. Se o comercial muda a regra de estudante, a auditoria não deveria ser tocada.

OCP tem duas leituras. A primeira é "aberto para extensão, fechado para modificação": você adiciona comportamento novo sem alterar o código existente. A segunda, mais honesta, é que OCP é uma aposta: você escolhe o eixo que provavelmente vai variar e prepara uma costura. Preparar todos os eixos é impossível e caro. O eixo escolhido aqui é o **tipo de desconto**, porque o histórico mostra que ele muda a cada trimestre.

O primeiro passo é separar a política da orquestração:

```java
import java.util.ArrayList;
import java.util.List;

enum TipoCliente { REGULAR, VIP, PARCEIRO }

class PedidoService {
    private final List<String> auditoria = new ArrayList<>();

    double fechar(TipoCliente tipo, double subtotal, String cliente) {
        // Seleção, cálculo e efeito colateral no mesmo método.
        double desconto = switch (tipo) {
            case REGULAR -> subtotal >= 500 ? subtotal * 0.05 : 0.0;
            case VIP -> subtotal * 0.15;
            case PARCEIRO -> subtotal * 0.10;
        };
        double total = subtotal - desconto;
        auditoria.add(cliente + ":" + total);
        return total;
    }

    List<String> auditoria() { return List.copyOf(auditoria); }
}
```

Esse método tem três razões para mudar e nenhuma delas pode ser testada isoladamente. Para adicionar `ESTUDANTE`, você altera o enum, o `switch` e o método que também audita. O compilador ajuda, mas o teste de auditoria passa a depender da regra de desconto.

A refatoração abaixo separa o cálculo em objetos que implementam um contrato e deixa a seleção explícita em um mapa imutável:

```java
import java.util.Map;
import java.util.Objects;

enum TipoCliente { REGULAR, VIP, PARCEIRO, ESTUDANTE }

interface Desconto {
    double aplicar(double subtotal);
}

record Percentual(double taxa) implements Desconto {
    public Percentual {
        if (taxa < 0 || taxa > 1) throw new IllegalArgumentException("taxa inválida");
    }
    public double aplicar(double subtotal) {
        return subtotal * taxa;
    }
}

record Progressivo(double limite, double taxaBase, double taxaExtra) implements Desconto {
    public double aplicar(double subtotal) {
        double taxa = subtotal >= limite ? taxaBase + taxaExtra : taxaBase;
        return subtotal * taxa;
    }
}

class PoliticaDesconto {
    private final Map<TipoCliente, Desconto> regras;

    PoliticaDesconto(Map<TipoCliente, Desconto> regras) {
        this.regras = Map.copyOf(regras);
    }

    double calcular(TipoCliente tipo, double subtotal) {
        Desconto regra = regras.get(tipo);
        if (regra == null) {
            throw new IllegalArgumentException("sem regra de desconto para " + tipo);
        }
        return regra.aplicar(subtotal);
    }
}

interface Auditoria {
    void registrar(String cliente, double total);
}

class FecharPedido {
    private final PoliticaDesconto politica;
    private final Auditoria auditoria;

    FecharPedido(PoliticaDesconto politica, Auditoria auditoria) {
        this.politica = Objects.requireNonNull(politica);
        this.auditoria = Objects.requireNonNull(auditoria);
    }

    double executar(TipoCliente tipo, double subtotal, String cliente) {
        double total = subtotal - politica.calcular(tipo, subtotal);
        auditoria.registrar(cliente, total);
        return total;
    }
}
```

A composição fica em um único ponto, normalmente o `main` ou a configuração da aplicação:

```java
PoliticaDesconto politica = new PoliticaDesconto(Map.of(
        TipoCliente.REGULAR, new Progressivo(500, 0.0, 0.05),
        TipoCliente.VIP, new Percentual(0.15),
        TipoCliente.PARCEIRO, new Percentual(0.10),
        TipoCliente.ESTUDANTE, new Percentual(0.20)
));
```

Adicionar uma promoção de primeira compra agora é criar outra implementação de `Desconto` e registrá-la. O cálculo existente não é reaberto. A seleção continua existindo — alguém precisa dizer qual regra vale para cada tipo —, mas ela está concentrada na composição, não espalhada em cada método de fechamento.

## Na prática

Há um detalhe que separa OCP de teatro: **o eixo de extensão precisa ser real**. Se o comercial muda a regra uma vez por ano, quatro classes e um mapa podem custar mais do que um `switch` de dez linhas. O padrão compensa quando a variação é frequente, quando cada regra tem time ou ciclo de aprovação diferente, ou quando você precisa testar combinações sem tocar no código estável.

Outro detalhe: `sealed interface` não é automaticamente OCP. Se `Desconto` for selada com `permits`, adicionar uma implementação exige editar o arquivo da interface, mesmo que o cálculo não mude. Isso pode ser desejável em um domínio fechado — o compilador garante que todos os casos são tratados —, mas não é extensão por plugin. Para extensão real, use uma interface aberta e um registro; para domínio fechado, use sealed e aceite o custo de editar o `permits`.

Em code review, a pergunta certa não é "esse código segue OCP?". É "qual mudança este design torna barata, e qual mudança ele torna cara?". A resposta precisa citar o requisito provável. Sem isso, você só trocou um `switch` por cinco arquivos.

## Armadilhas comuns

- **Criar uma interface para cada `if`.** Abstração prematura adiciona navegação e não remove complexidade. Extraia quando houver a segunda variação real ou uma previsão forte baseada em histórico.
- **Deixar a seleção espalhada.** Se cada serviço faz `if (tipo == VIP)`, você não aplicou OCP; só moveu o problema. A escolha deve ter um dono.
- **Confundir SRP com divisão por camadas.** Separar controller, service e repository não garante coesão dentro do service. Os motivos de mudança continuam sendo o critério.
- **Esquecer o caso ausente.** Um mapa que retorna `null` e um `default` silencioso produzem cobrança errada. Falhe explicitamente na configuração.

## Checklist de domínio

- [ ] Você explica a diferença entre separar responsabilidades e separar arquivos
- [ ] Você identifica o eixo de variação de um cálculo antes de abstraí-lo
- [ ] Você implementa uma política com registro e trata chave ausente
- [ ] Você sabe justificar quando um `switch` simples é a melhor escolha

## Para ir além

- [Single Responsibility Principle](https://www.baeldung.com/java-single-responsibility-principle) — exemplos de motivos de mudança em Java.
- [Open/Closed Principle](https://www.baeldung.com/java-open-closed-principle) — extensão com interfaces e o custo da abstração.
- [Strategy](https://refactoring.guru/design-patterns/strategy) — o padrão que sustenta a refatoração do cálculo sem condicionais.
