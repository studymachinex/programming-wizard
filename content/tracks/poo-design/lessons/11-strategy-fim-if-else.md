> **Em uma frase:** Strategy transforma cada variação de uma regra em um objeto testável e deixa a escolha em um único ponto de composição — não elimina a decisão, apenas tira a condicional do cálculo.

## O problema

O cálculo de frete tem três modalidades e duas condições comerciais. O código começa com um `if` para normal, outro para expressa e um retorno zero para retirada. Depois entra a promoção de cliente premium, o frete grátis acima de um valor e a transportadora parceira. Cada mudança exige editar o mesmo método, e o teste precisa montar um pedido para cada ramo.

Pior: a mesma regra aparece na cotação do carrinho e no fechamento do pedido. As duas cópias divergem. O cliente vê um valor, é cobrado por outro, e o suporte descobre que a cotação usava uma tabela antiga. O problema não é ter `if`; é ter **regras que variam de forma independente** comprimidas em um único bloco.

## Como funciona

Strategy define uma família de algoritmos, encapsula cada um atrás de um contrato comum e permite trocar a implementação sem o cliente conhecer a classe concreta. O contexto recebe a estratégia — por construtor ou por seleção — e delega o cálculo.

O ponto que quase todo tutorial esconde: a seleção continua existindo. Alguém precisa responder “qual estratégia para esta modalidade?”. O ganho é que essa resposta fica em um mapa imutável, na composição, e não espalhada por cada cálculo. O fluxo de negócio fica fechado para modificação; a configuração continua aberta.

Antes, a regra e a seleção estão no mesmo lugar:

```java
record Pedido(long pesoGramas, long valorCentavos, boolean clientePremium) {}

class FreteAntigo {
    long calcular(String modalidade, Pedido pedido) {
        if (modalidade.equals("normal")) {
            long base = 1_500 + (pedido.pesoGramas() / 1_000) * 200;
            return pedido.clientePremium() ? base / 2 : base;
        } else if (modalidade.equals("expressa")) {
            long base = 3_000 + (pedido.pesoGramas() / 1_000) * 350;
            return pedido.clientePremium() ? base * 8 / 10 : base;
        } else if (modalidade.equals("retirada")) {
            return 0;
        }
        return 0; // modalidade desconhecida vira frete grátis
    }
}
```

Depois, cada regra tem seu tipo e o contexto só delega:

```java
import java.util.Map;

enum Modalidade { NORMAL, EXPRESSA, RETIRADA }

interface CalculadoraFrete {
    long calcular(Pedido pedido);
}

final class FreteNormal implements CalculadoraFrete {
    @Override
    public long calcular(Pedido pedido) {
        long base = 1_500 + (pedido.pesoGramas() / 1_000) * 200;
        return pedido.clientePremium() ? base / 2 : base;
    }
}

final class FreteExpressa implements CalculadoraFrete {
    @Override
    public long calcular(Pedido pedido) {
        long base = 3_000 + (pedido.pesoGramas() / 1_000) * 350;
        return pedido.clientePremium() ? base * 8 / 10 : base;
    }
}

final class Retirada implements CalculadoraFrete {
    @Override
    public long calcular(Pedido pedido) {
        return 0;
    }
}

final class ServicoFrete {
    private final Map<Modalidade, CalculadoraFrete> estrategias;

    ServicoFrete(Map<Modalidade, CalculadoraFrete> estrategias) {
        this.estrategias = Map.copyOf(estrategias);
    }

    long calcular(Modalidade modalidade, Pedido pedido) {
        CalculadoraFrete estrategia = estrategias.get(modalidade);
        if (estrategia == null) {
            throw new IllegalArgumentException("sem cálculo para " + modalidade);
        }
        return estrategia.calcular(pedido);
    }
}

class Composicao {
    public static void main(String[] args) {
        var servico = new ServicoFrete(Map.of(
                Modalidade.NORMAL, new FreteNormal(),
                Modalidade.EXPRESSA, new FreteExpressa(),
                Modalidade.RETIRADA, new Retirada()));
        System.out.println(servico.calcular(Modalidade.NORMAL,
                new Pedido(2_500, 20_000, false))); // 1900
    }
}
```

`Map.copyOf` rejeita chave ou valor nulo e devolve um mapa imutável. A ausência de uma modalidade agora falha com mensagem explícita, em vez de cobrar frete zero. Cada cálculo pode ser testado com um `Pedido` pequeno, sem passar pelo serviço inteiro.

## Na prática

Strategy paga quando há variação real: cinco modalidades, regras que mudam por contrato ou por região, algoritmos que precisam ser testados isoladamente. Também ajuda quando a escolha vem de configuração e pode mudar sem recompilar o núcleo — basta trocar o mapa na composição.

Não pague quando há dois ramos estáveis. Um método de quinze linhas com um `if` bem nomeado é mais fácil de ler do que três classes, uma interface e uma fiação. O padrão adiciona um salto de navegação: para entender o cálculo, o leitor precisa descobrir qual implementação foi registrada.

Cuidado com variações ortogonais. Se o frete depende de modalidade **e** região **e** tipo de cliente, uma estratégia por combinação explode em dezenas de classes. Nesse caso, componha funções menores (`Peso`, `Regiao`, `Cliente`) ou mantenha uma tabela de parâmetros; Strategy sozinho não resolve o produto cartesiano.

## Armadilhas comuns

- **Mapa com `default` silencioso.** `getOrDefault(modalidade, new FreteGratis())` transforma erro de configuração em prejuízo. Falhe explicitamente.
- **Estratégia com estado compartilhado.** Se a implementação guarda o último pedido em um campo, duas threads misturam cálculos. Estratégias devem ser stateless ou receber todo o contexto por parâmetro.
- **Interface gigante.** Se `CalculadoraFrete` tem `calcular`, `validar`, `nome` e `prazo`, talvez você tenha criado um serviço disfarçado. Mantenha o contrato no nível da operação.
- **Seleção espalhada.** Um `switch` em cada chamador anula o ganho. A escolha pertence à borda; o núcleo recebe a estratégia pronta.
- **Confundir Strategy com State.** Em Strategy, o cliente escolhe e normalmente a escolha é fixa durante a operação. Em State, o próprio objeto muda de estado e dispara a próxima transição.

| Sinal no código | Decisão |
|---|---|
| Quatro ou mais regras mutuamente exclusivas | Strategy |
| Dois ramos estáveis e cobertos por um teste | `if` simples |
| Regras testadas isoladamente | Strategy |
| Combinação de vários eixos | compor funções ou tabela |

## Checklist de domínio

- [ ] Você refatora um `switch` de regras em estratégias sem esconder a seleção
- [ ] Você registra estratégias em um mapa imutável e falha para chave ausente
- [ ] Você testa cada regra e a composição separadamente
- [ ] Você reconhece quando a variação é pequena demais para pagar o padrão

## Para ir além

- [Strategy](https://refactoring.guru/design-patterns/strategy) — estrutura, colaboração e variantes.
- [Map.copyOf](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Map.html#copyOf(java.util.Map)) — imutabilidade e rejeição de nulos no registro.
- [Java SE 21 — Enum](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Enum.html) — base para chaves de seleção seguras.
