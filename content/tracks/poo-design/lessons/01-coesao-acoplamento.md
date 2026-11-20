> **Em uma frase:** coesão e acoplamento são as duas forças que explicam por que um código é fácil ou impossível de mudar; métricas só tornam essa conversa objetiva.

## O problema

Toda code review tem um momento em que alguém diz "essa classe está grande demais". O autor responde que o código funciona, os testes passam e o prazo aperta. Sem um critério compartilhado, a discussão vira gosto pessoal — e o problema volta no próximo trimestre, um pouco maior.

O caso clássico é o `PedidoService`. Ele nasce com um método `fechar`, depois ganha desconto, imposto, formatação de recibo, envio de e-mail e gravação de auditoria. Em seis meses, ninguém consegue testar o cálculo sem mockar o SMTP. O arquivo tem 600 linhas, 11 dependências e mudou em 31 dos últimos 120 dias. Nenhum desses números, isolado, prova que o design está ruim. Juntos, eles mostram onde a mudança dói.

## Como funciona

**Coesão** mede o quanto as partes de um módulo pertencem ao mesmo assunto. **Acoplamento** mede o quanto um módulo precisa saber sobre outro. O objetivo não é zerar nenhum dos dois: um sistema sem acoplamento não faz nada. O objetivo é que cada módulo tenha uma responsabilidade clara e que as dependências apontem para contratos estáveis.

Três métricas ajudam a sair da intuição:

| Métrica | O que mede | Sinal de alerta |
|---|---|---|
| Instabilidade `I = Ce / (Ca + Ce)` | Dependências de saída (`Ce`) contra entradas (`Ca`) | Classe central com `I` alto: muita gente depende dela e ela depende de tudo |
| LCOM | Quanto os métodos compartilham os mesmos campos | Métodos que tocam conjuntos disjuntos de estado |
| Complexidade ciclomática | Caminhos independentes em um método | Acima de ~10, teste e leitura ficam caros |

Se `Ca = 3` e `Ce = 9`, então `I = 9 / 12 = 0,75`. A classe é instável: nove módulos podem forçá-la a mudar e apenas três dependem dela. Isso não é pecado em um adapter de borda. É grave em uma regra de negócio central. O Stable Dependencies Principle diz que dependências devem apontar para módulos mais estáveis — na prática, para abstrações que mudam menos que os detalhes.

Coesão não se mede só por LCOM. A pergunta mais útil é: **quantos motivos independentes de mudança esta classe tem?** Um imposto novo, um layout novo de recibo e um provedor novo de e-mail são três motivos. Se os três moram na mesma classe, ela tem baixa coesão mesmo que seus métodos compartilhem campos.

```java
import java.util.ArrayList;
import java.util.List;

record Item(String nome, double preco) {}

class Pedido {
    private final List<Item> itens = new ArrayList<>();
    void adicionar(Item item) { itens.add(item); }
    List<Item> itens() { return List.copyOf(itens); }
    double subtotal() { return itens.stream().mapToDouble(Item::preco).sum(); }
}

class PedidoService {
    private final List<String> caixaDeSaida = new ArrayList<>();

    String fechar(Pedido pedido) {
        // Regra de negócio, apresentação e infraestrutura no mesmo lugar.
        double desconto = pedido.subtotal() >= 500 ? pedido.subtotal() * 0.10 : 0.0;
        double imposto = (pedido.subtotal() - desconto) * 0.12;
        String recibo = """
                Itens: %d
                Total: R$ %.2f
                """.formatted(pedido.itens().size(), pedido.subtotal() - desconto + imposto);

        // Simula um efeito externo que deveria ser uma dependência injetada.
        caixaDeSaida.add("recibo para cliente: " + recibo.length() + " chars");
        return recibo;
    }

    List<String> caixaDeSaida() { return List.copyOf(caixaDeSaida); }
}
```

O código compila e até parece organizado. O problema está no eixo de mudança: trocar o cálculo do imposto, mudar o formato do recibo e migrar de SMTP são alterações independentes que disputam o mesmo arquivo. Um teste do cálculo precisa instanciar a classe inteira, e o `caixaDeSaida` esconde a dependência externa.

A versão seguinte separa os eixos sem criar microserviços:

```java
import java.util.List;

record Item(String nome, double preco) {}
record Pedido(List<Item> itens) {
    Pedido { itens = List.copyOf(itens); }
    double subtotal() { return itens.stream().mapToDouble(Item::preco).sum(); }
}

class CalculadoraTotal {
    double total(Pedido pedido) {
        double bruto = pedido.subtotal();
        double desconto = bruto >= 500 ? bruto * 0.10 : 0.0;
        double imposto = (bruto - desconto) * 0.12;
        return bruto - desconto + imposto;
    }
}

class FormatadorRecibo {
    String formatar(Pedido pedido, double total) {
        return "Itens: %d%nTotal: R$ %.2f".formatted(pedido.itens().size(), total);
    }
}

interface EnviadorEmail {
    void enviar(String destino, String assunto, String corpo);
}

class FechamentoPedido {
    private final CalculadoraTotal calculadora;
    private final FormatadorRecibo formatador;
    private final EnviadorEmail email;

    FechamentoPedido(CalculadoraTotal calculadora,
                     FormatadorRecibo formatador,
                     EnviadorEmail email) {
        this.calculadora = calculadora;
        this.formatador = formatador;
        this.email = email;
    }

    String fechar(Pedido pedido, String clienteEmail) {
        double total = calculadora.total(pedido);
        String corpo = formatador.formatar(pedido, total);
        email.enviar(clienteEmail, "Seu pedido", corpo);
        return corpo;
    }
}
```

Agora `CalculadoraTotal` pode ser testada com um `Pedido` e nada mais. O envio de e-mail tem uma interface própria e será testado com um fake. `FechamentoPedido` orquestra, mas não calcula nem formata. Cada classe tem um motivo dominante para mudar.

## Na prática

Métricas são bússola, não sentença. Um adapter de banco com `I = 1` é normal: ele depende do driver e ninguém depende dele. Uma classe de configuração com LCOM alto pode ser apenas um agrupamento de constantes. O que merece ação é a combinação de **complexidade + acoplamento + frequência de mudança**. Se o arquivo muda toda semana, tem 12 dependências e ninguém consegue testá-lo, a refatoração tem retorno mensurável.

O caminho de menor risco é incremental: escreva testes de caracterização nos fluxos que você vai tocar, extraia uma responsabilidade por vez e rode a suíte a cada passo. Não abra um `PedidoServiceV2` e reescreva tudo. Em produção, um big bang de design costuma terminar com dois sistemas e nenhum confiável.

E quando **não** refatorar? Quando o código é estável, tem poucos dependentes e ninguém precisa mexer nele há meses. Coesão baixa em código morto é dívida teórica. O custo de navegação de dez classes novas pode ser maior que o de uma função de 40 linhas que ninguém toca. Design é uma aposta sobre o futuro: só invista quando houver evidência de que aquele futuro chega.

## Armadilhas comuns

- **Contar linhas como se fosse design.** Uma classe de 300 linhas pode ser coesa; uma de 80 pode misturar quatro responsabilidades. Olhe os motivos de mudança e as dependências.
- **Extração que só muda o endereço do problema.** Mover o switch para um `Util` estático não cria coesão; apenas esconde o acoplamento.
- **Otimizar métrica em vez de fluxo.** Reduzir LCOM dividindo uma classe em duas que sempre mudam juntas piora a navegação. Meça o custo real de manutenção.
- **Ignorar o time.** Um design que só o autor entende não é bom design. Coesão também é sobre o modelo mental compartilhado.

## Checklist de domínio

- [ ] Você calcula instabilidade e explica o resultado em uma frase de negócio
- [ ] Você identifica os motivos de mudança de uma classe sem olhar o tamanho dela
- [ ] Você propõe uma extração incremental com testes antes de mover código
- [ ] Você sabe dizer quando uma métrica alta é aceitável pelo contexto

## Para ir além

- [SOLID Principles](https://www.baeldung.com/solid-principles) — a base dos cinco princípios com exemplos Java.
- [Code Smells](https://refactoring.guru/refactoring/smells) — catálogo visual para nomear o que está errado sem achismo.
- [Single Responsibility Principle](https://martinfowler.com/bliki/SingleResponsibilityPrinciple.html) — a definição de "motivo para mudar" por quem popularizou o termo.
