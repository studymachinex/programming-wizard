> **Em uma frase:** em containers, a aplicação escreve o log em `stdout` e `stderr`, o Docker o captura por um *logging driver* (o padrão é o `json-file`, que **não gira sozinho**), e quem não configura a rotação e um coletor perde logs na recriação ou enche o disco do host.

## O problema

A `pedidos-api` grava `/var/log/pedidos/app.log`, como numa VM. Numa sexta-feira, um erro derruba o container, o orquestrador o recria em outro nó e, na segunda-feira, a investigação começa sem **nenhuma linha de log**: o arquivo estava na camada gravável do container antigo (aula 5) e foi removido junto com ele.

Na outra ponta do problema, um serviço de alto volume escreve em `stdout` sem parar, e o disco do host chega a 100% em duas semanas: o Docker, os outros containers e o `sshd` começam a falhar juntos. A causa não é o código, é uma configuração que ninguém fez. As duas histórias são o mesmo assunto: **onde o log vive e quem o gira**.

## Como funciona

A convenção de containers (a regra de logs do *Twelve-Factor App*) é tratar o log como um **fluxo de eventos**: o processo escreve em `stdout` e `stderr`, sem se preocupar com arquivos, e o ambiente decide o destino. No Docker, o **containerd-shim** captura os dois fluxos do PID 1 e os entrega ao **logging driver** do container.

O driver padrão é o **`json-file`**. Ele grava uma linha JSON por registro, com o texto, o fluxo (`stdout` ou `stderr`) e o horário, em `/var/lib/docker/containers/<id>/<id>-json.log`. O `docker logs` lê esse arquivo. O ponto crítico: **sem opções, o `json-file` não faz rotação**, e o arquivo cresce enquanto o container existir.

Os drivers que o Docker oferece:

| Driver | `docker logs` | Rotação |
|---|---|---|
| `json-file` (padrão) | funciona | só com `max-size` e `max-file` |
| `local` | funciona | por padrão: 20 MB por arquivo, 5 arquivos, comprimidos |
| `journald` | funciona | feita pelo journald |
| `syslog`, `fluentd`, `gelf`, `awslogs` e outros | funciona com **dual logging**, a partir do Docker 20.10 | do lado do destino |

Com os drivers remotos, o *dual logging* mantém uma cópia local em cache, e o `docker logs` continua respondendo. Sem ele, só os drivers que guardam em disco o suportavam.

A rotação do `json-file` se liga com `max-size` (tamanho de cada arquivo) e `max-file` (quantos arquivos manter). Defina no `/etc/docker/daemon.json` para todos os containers **criados depois** (os existentes precisam ser recriados), ou por container com `--log-opt`:

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

Para logs que precisam sobreviver ao container e ao host, um **coletor** (Fluent Bit, Vector, Promtail, o agente da nuvem) lê esses arquivos, ou recebe os eventos do driver, e os envia a um backend de busca (Loki, Elasticsearch, CloudWatch). Para o backend filtrar por nível, pedido e *trace*, escreva logs **estruturados**: uma linha de JSON por evento.

## Na prática

Os comandos do dia a dia:

```bash
docker logs --tail 20 api            # as últimas 20 linhas
docker logs -f --since 10m api       # seguir, só dos últimos 10 minutos
docker logs -t api                   # com o horário de cada linha
docker logs api 2>/dev/null          # só o stdout
docker inspect -f '{{.LogPath}}' api
docker inspect -f '{{.HostConfig.LogConfig}}' api
```

O `docker logs` preserva a separação dos fluxos: o `2>/dev/null` acima descarta o que veio do `stderr`. Em um container criado sem opções, o `LogConfig` mostra `{json-file map[]}`, o mapa vazio indicando que **não há rotação**. Depois de configurar o `daemon.json`, containers novos mostram `{json-file map[max-file:3 max-size:10m]}`.

O programa Java abaixo escreve logs estruturados sem biblioteca alguma: uma linha JSON por evento, com `level`, `msg` e os campos de negócio, avisos em `stdout` e erros em `stderr`. É o formato que um coletor consegue indexar:

```java
import java.io.PrintStream;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public class LogJson {
    public static void main(String[] args) {
        Map<String, Object> pedido = new LinkedHashMap<>();
        pedido.put("pedido", "A-1042");
        pedido.put("ms", 38);
        info("pedido criado", pedido);

        Map<String, Object> estoque = new LinkedHashMap<>();
        estoque.put("sku", "CAM-77");
        estoque.put("restante", 3);
        aviso("estoque baixo", estoque);

        Map<String, Object> falha = new LinkedHashMap<>();
        falha.put("pedido", "A-1043");
        falha.put("erro", "timeout ao cobrar: \"gateway\" não respondeu");
        erro("falha na cobrança", falha);
    }

    static void info(String msg, Map<String, Object> campos) { escrever(System.out, "INFO", msg, campos); }

    static void aviso(String msg, Map<String, Object> campos) { escrever(System.out, "WARN", msg, campos); }

    /** Erros vão para stderr: o Docker guarda os dois fluxos e os distingue no json-file. */
    static void erro(String msg, Map<String, Object> campos) { escrever(System.err, "ERROR", msg, campos); }

    private static void escrever(PrintStream saida, String nivel, String msg, Map<String, Object> campos) {
        StringBuilder json = new StringBuilder();
        json.append("{\"ts\":\"").append(Instant.now()).append("\",\"level\":\"").append(nivel)
            .append("\",\"msg\":\"").append(escapar(msg)).append('"');
        campos.forEach((chave, valor) -> {
            json.append(",\"").append(escapar(chave)).append("\":");
            if (valor instanceof Number) json.append(valor);
            else json.append('"').append(escapar(String.valueOf(valor))).append('"');
        });
        json.append('}');
        saida.println(json); // uma linha por evento: o coletor lê linha a linha
    }

    private static String escapar(String texto) {
        StringBuilder sb = new StringBuilder();
        for (char c : texto.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.toString();
    }
}
```

Em um projeto real, use uma biblioteca (a extensão de logs JSON do Quarkus, ou o Logback com um encoder JSON) em vez de escapar à mão. Rode-o num container com `docker run --name log -v "$PWD:/app" eclipse-temurin:21-jdk java /app/LogJson.java` e confira `docker logs log` (as três linhas) e `docker logs log 2>/dev/null` (só as duas de `stdout`).

## Armadilhas comuns

- **Gravar o log em arquivo dentro do container.** Ele some na recriação e pode encher a camada gravável. Escreva em `stdout` e `stderr`.
- **Esquecer a rotação do `json-file`.** O incidente do disco cheio é a consequência mais comum. Configure `max-size` e `max-file` (ou o driver `local`) em **todo** host, e lembre que a mudança só vale para containers novos.
- **Logar demais.** `DEBUG` em produção a todo momento gera gigabytes e custo de coleta. Use níveis e amostragem.
- **Logs de várias linhas.** Um *stack trace* em linhas separadas vira vários eventos no coletor. Em JSON, o trace entra como um campo do mesmo evento.
- **Confiar que o `docker logs` funciona com qualquer driver.** Com drivers remotos, sem dual logging, o comando responde que o driver não suporta a leitura.
- **Registrar dados sensíveis.** Senhas, tokens e dados pessoais não pertencem a um log que vai para um sistema de busca compartilhado.

## Checklist de domínio

- [ ] Você explica por que log em arquivo se perde junto com o container
- [ ] Você descreve o caminho do `stdout` até o `docker logs` (shim, driver, arquivo)
- [ ] Você configura `max-size` e `max-file` e sabe que só valem para containers novos
- [ ] Você compara `json-file`, `local` e os drivers remotos, incluindo o dual logging
- [ ] Você escreve logs estruturados que um coletor consegue indexar

## Para ir além

- [Docker: configurar logging drivers](https://docs.docker.com/engine/logging/configure/)
- [Driver json-file](https://docs.docker.com/engine/logging/drivers/json-file/)
- [Driver local](https://docs.docker.com/engine/logging/drivers/local/)
- [docker logs com drivers remotos (dual logging)](https://docs.docker.com/engine/logging/dual-logging/)
- [Docker: logs e métricas](https://docs.docker.com/engine/logging/)
