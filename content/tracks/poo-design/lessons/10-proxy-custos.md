> **Em uma frase:** Proxy é um substituto que implementa o mesmo contrato do objeto real para adiar criação, controlar acesso ou atravessar uma fronteira — e cada uma dessas liberdades tem custo.

## O problema

O relatório financeiro leva quatro segundos para carregar e agrega quatrocentas mil linhas. Ele é injetado em todo controller que exibe o menu, inclusive na tela inicial, que só mostra a quantidade de pedidos. Resultado: a aplicação demora quarenta segundos para subir e cada usuário paga memória por um relatório que talvez nunca abra.

Há também o problema de acesso. Uma classe de serviço verifica perfil em alguns métodos, mas esquece em `exportarCsv`. A regra de autorização está espalhada, e a auditoria não sabe quem chamou o quê. Em ambos os casos, falta um intermediário que fique entre o cliente e o objeto real — sem mudar a interface que o cliente conhece.

## Como funciona

Proxy implementa a mesma interface do alvo e mantém uma referência a ele. O cliente acredita estar falando com o objeto real. O proxy decide **quando** criar, **se** deve permitir e **o que** registrar antes ou depois da chamada.

As variações mais comuns:

| Tipo | O que faz | Exemplo |
|---|---|---|
| Virtual | adia a criação até o primeiro uso | relatório carregado sob demanda |
| Proteção | verifica permissão antes de delegar | exportação restrita a auditor |
| Remoto | encapsula chamada de rede | cliente de API externa |
| Dinâmico | gera o proxy em runtime | AOP, transações, métricas |

O proxy virtual mantém o contrato e troca o custo de inicialização por uma verificação no primeiro acesso:

```java
import java.util.List;
import java.util.function.Supplier;

record Linha(String conta, long valorCentavos) {}

interface Relatorio {
    List<Linha> linhas();
}

final class RelatorioPesado implements Relatorio {
    private final List<Linha> dados;

    RelatorioPesado() {
        this.dados = carregarDoBanco(); // quatro segundos no construtor
    }

    private List<Linha> carregarDoBanco() {
        return List.of(new Linha("receita", 10_000_00), new Linha("despesa", 4_000_00));
    }

    @Override
    public List<Linha> linhas() {
        return dados;
    }
}

final class RelatorioLazy implements Relatorio {
    private final Supplier<Relatorio> fabrica;
    private Relatorio real;

    RelatorioLazy(Supplier<Relatorio> fabrica) {
        this.fabrica = fabrica;
    }

    @Override
    public synchronized List<Linha> linhas() {
        if (real == null) {
            real = fabrica.get(); // criação adiada e protegida contra corrida
        }
        return real.linhas();
    }
}
```

O cliente recebe `new RelatorioLazy(RelatorioPesado::new)`. Nenhuma linha muda no tipo declarado. O primeiro `linhas()` paga o custo; os seguintes usam o objeto já criado. Note o `synchronized`: sem ele, duas threads podem criar dois relatórios e uma sobrescrever a outra.

Quando a interceptação precisa valer para muitas interfaces, o proxy dinâmico evita escrever uma classe por alvo:

```java
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

final class AuditoriaHandler implements InvocationHandler {
    private final Object alvo;

    AuditoriaHandler(Object alvo) {
        this.alvo = alvo;
    }

    @Override
    public Object invoke(Object proxy, Method metodo, Object[] args) throws Throwable {
        long inicio = System.nanoTime();
        try {
            return metodo.invoke(alvo, args);
        } catch (InvocationTargetException e) {
            throw e.getCause(); // preserva a exceção real, não a de reflexão
        } finally {
            long nanos = System.nanoTime() - inicio;
            System.out.printf("%s levou %d ns%n", metodo.getName(), nanos);
        }
    }

    static Relatorio comAuditoria(Relatorio alvo) {
        return (Relatorio) Proxy.newProxyInstance(
                Relatorio.class.getClassLoader(),
                new Class<?>[]{Relatorio.class},
                new AuditoriaHandler(alvo));
    }
}
```

## Na prática

Use proxy virtual quando o objeto é caro e o uso é incerto: relatórios, imagens, conexões, árvores grandes. Use proxy de proteção quando a verificação precisa ser impossível de esquecer, porque ela fica no único caminho de entrada. Use proxy dinâmico quando o comportamento é transversal e vale para dezenas de tipos — métricas, tracing, transações.

O custo é real. Uma chamada direta é candidata a inlining pelo JIT; um proxy dinâmico aloca o array de argumentos, faz boxing quando há primitivos, passa por reflexão e produz stack traces com frames sintéticos. Em um caminho chamado milhões de vezes por segundo, dezenas de nanossegundos viram segundos de CPU. Meça antes de aplicar em loop quente.

O pitfall mais famoso de frameworks é a **self-invocation**. Se um bean gerenciado chama `this.metodoTransacional()`, a chamada não passa pelo proxy que o container criou; ela usa a referência real. A anotação parece estar lá, mas não é aplicada. A correção é mover o método para outro bean ou redesenhar a fronteira transacional — não confiar em anotação em método privado.

## Armadilhas comuns

- **Proxy que cria um objeto novo a cada chamada.** Isso deixa de ser proxy e vira fábrica; identidade e cache se perdem.
- **Não repassar `equals`, `hashCode` e `toString`.** Em coleções, o proxy pode ser tratado como diferente do alvo e quebrar buscas.
- **Engolir `InvocationTargetException`.** Sem `getCause()`, o stack trace aponta para a reflexão e esconde a linha real.
- **Proteger a UI e não o serviço.** Qualquer novo cliente contorna a regra. A proteção pertence ao ponto de entrada do caso de uso.
- **Usar proxy para tudo.** Logging universal em métodos triviais polui stack traces, adiciona alocação e dificulta depuração; um decorator explícito costuma ser mais legível.

| Necessidade | Solução preferida |
|---|---|
| Adiar objeto caro | proxy virtual |
| Checar permissão em um caso de uso | proxy de proteção ou política explícita |
| Métricas em muitos tipos | proxy dinâmico com benchmark |
| Chamada em loop crítico | chamada direta |

## Checklist de domínio

- [ ] Você implementa um proxy virtual thread-safe sem alterar o cliente
- [ ] Você explica `InvocationHandler` e o tratamento de `InvocationTargetException`
- [ ] Você reconhece self-invocation em proxies de framework
- [ ] Você mede o custo da indireção antes de usar em caminho quente

## Para ir além

- [Proxy](https://refactoring.guru/design-patterns/proxy) — variantes, estrutura e comparação com Decorator.
- [java.lang.reflect.Proxy](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/reflect/Proxy.html) — contrato da API de proxy dinâmico.
- [java.lang.reflect.InvocationHandler](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/reflect/InvocationHandler.html) — como a chamada é interceptada.
