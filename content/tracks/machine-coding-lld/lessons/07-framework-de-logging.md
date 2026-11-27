> **Em uma frase:** um framework de logging é uma árvore de loggers nomeados, com nível herdado e appenders que recebem os eventos dos descendentes, e as decisões de design aparecem no custo de um log desligado e no que acontece quando o disco enche.

## O problema

Você usa SLF4J e Logback todo dia sem pensar nisso. Na rodada de machine coding, o enunciado é "desenhe um framework de logging com níveis e appenders", e o entrevistador quer ver se você enxerga as peças. Por que `log.debug("x=" + x)` é ruim e `log.debug("x={}", x)` não é? Como `logging.level.com.empresa.pagamentos=DEBUG` liga o DEBUG só de um pacote? Por que uma linha às vezes aparece duplicada no console?

## Como funciona

### Quatro peças, quatro responsabilidades

| Peça | Responsabilidade | Varia? |
|---|---|---|
| `Logger` | API de quem escreve log; decide se o nível está ligado | Não |
| `Evento` | Dado imutável: instante, nível, logger, mensagem | Não |
| `Formatador` | Transforma evento em texto (padrão, JSON, logfmt) | Sim |
| `Appender` | Leva a linha a um destino (console, arquivo, rede) | Sim |

`Formatador` e `Appender` são Strategies. A fábrica guarda a configuração e a árvore de loggers.

### Nomes hierárquicos e nível efetivo

O nome `app.pagamentos.pix` tem pai `app.pagamentos`, que tem pai `app`, que tem pai a raiz `""`. O **nível efetivo** é o do nome mais específico que tiver nível configurado. Só a raiz precisa ter um padrão (INFO). Repare que a hierarquia é por **segmento**: `application` não é filho de `app`, e é por isso que se usa `lastIndexOf('.')`, e não `startsWith`.

```java
import java.util.*;

class Niveis {
    enum Nivel { DEBUG, INFO, WARN, ERROR }

    private final Map<String, Nivel> configurados = new HashMap<>(Map.of("", Nivel.INFO));

    void definir(String nome, Nivel nivel) { configurados.put(nome, nivel); }

    Nivel efetivo(String nome) {
        for (String n = nome; ; n = pai(n)) {
            Nivel v = configurados.get(n);
            if (v != null) return v; // a raiz sempre tem nível
        }
    }

    static String pai(String nome) {
        int i = nome.lastIndexOf('.');
        return i < 0 ? "" : nome.substring(0, i);
    }
}
```

### Additivity: o evento sobe a árvore

Um evento de `app.pagamentos.pix` vai para os appenders do próprio logger **e de todos os ancestrais**. Isso permite um appender de console na raiz e um appender de arquivo só para `app.pagamentos`. O efeito colateral é famoso: anexar o mesmo appender de console à raiz e a `app` faz cada linha de `app` aparecer duas vezes. O Logback resolve com `additivity="false"` no logger filho, que interrompe a subida.

### O custo de um log desligado

`log.debug("pedido " + pedido)` concatena a string, chamando `pedido.toString()`, **antes** de entrar no método, mesmo com DEBUG desligado. Num laço quente, isso é CPU e lixo para o GC. Com placeholders, o framework confere o nível primeiro e só formata se for publicar:

```java
class Logger {
    private final String nome;
    private final Fabrica fabrica;

    Logger(String nome, Fabrica fabrica) { this.nome = nome; this.fabrica = fabrica; }

    void debug(String msg, Object... args) { log(Niveis.Nivel.DEBUG, msg, args); }

    private void log(Niveis.Nivel nivel, String msg, Object... args) {
        if (nivel.compareTo(fabrica.nivelEfetivo(nome)) < 0) return; // nenhum toString chamado
        fabrica.publicar(nome, nivel, formatar(msg, args));
    }

    static String formatar(String msg, Object... args) {
        StringBuilder sb = new StringBuilder();
        int a = 0, i = 0;
        while (i < msg.length()) {
            if (a < args.length && msg.startsWith("{}", i)) { sb.append(args[a++]); i += 2; }
            else sb.append(msg.charAt(i++));
        }
        return sb.toString();
    }

    interface Fabrica {
        Niveis.Nivel nivelEfetivo(String nome);
        void publicar(String nome, Niveis.Nivel nivel, String mensagem);
    }
}
```

O varargs ainda aloca um `Object[]`. Por isso o SLF4J tem sobrecargas com um e dois argumentos fixos, e o Log4j 2 tem sobrecargas até dez.

## Na prática

- **Logging nunca derruba a aplicação.** Disco cheio, socket fechado, formatador com bug: cada appender roda num `try/catch`, a falha é contada e os outros appenders seguem. O Logback registra esses erros no próprio status manager, e não na aplicação.
- **Appender síncrono bloqueia a request.** Escrever no disco ou na rede no thread da request soma latência. O `AsyncAppender` do Logback põe os eventos numa fila limitada e um thread escreve. A decisão difícil é o que fazer com a fila cheia: bloquear ou descartar. O padrão do Logback descarta DEBUG e INFO quando a fila está 80% cheia.
- **Nível efetivo em cache.** Subir a árvore a cada chamada custa O(profundidade). O Logback guarda o nível efetivo no próprio logger e propaga mudanças para os filhos quando a configuração muda.
- **Logs estruturados.** Em produção, o formatador JSON vale mais que o bonito, porque Datadog, Loki e CloudWatch indexam campos. Contexto por request (traceId, userId) entra via MDC, um `ThreadLocal` que o formatador lê.

## Armadilhas comuns

- **`startsWith` para hierarquia.** Faz `application` herdar a configuração de `app`.
- **Formatar antes de checar o nível.** Mata o principal ganho dos placeholders.
- **Engolir exceção sem contar.** Isolar a falha é certo, mas é preciso deixar rastro (contador, stderr) para alguém descobrir que o appender de arquivo morreu há três dias.
- **Logger como singleton global estático no código de negócio.** Na entrevista, injete a fábrica para poder testar com um appender em memória.

## Checklist de domínio

- [ ] Você calcula o nível efetivo subindo por segmentos de nome
- [ ] Você explica additivity e a linha duplicada
- [ ] Você prova com teste que log desligado não chama `toString`
- [ ] Você isola falha de appender sem perder o rastro

## Para ir além

- [Logback: Architecture](https://logback.qos.ch/manual/architecture.html): loggers, appenders, layouts, nível efetivo e additivity, direto da fonte.
- [SLF4J FAQ: performance de parâmetros](https://www.slf4j.org/faq.html#logging_performance): por que `{}` é mais barato que concatenação.
- [Awesome LLD: Logging Framework](https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/logging-framework.md): requisitos e uma solução de referência.
