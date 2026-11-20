# Build your own Kafka — Java

Este é o repositório inicial do desafio **Kafka** do Programming Wizard.

Você vai construir um **broker** que fala o protocolo binário do Apache Kafka: o cliente
manda requests pela rede, e o seu programa responde exatamente no formato que clientes
Kafka de verdade esperam.

| API | Versão | Para quê |
|---|---|---|
| ApiVersions (18) | 4 | o cliente descobre o que o broker suporta |
| DescribeTopicPartitions (75) | 0 | metadados de tópicos e partições |
| Fetch (1) | 16 | ler mensagens |
| Produce (0) | 11 | gravar mensagens |

## Execução

```bash
./your_program.sh server.properties
```

```properties
listeners=PLAINTEXT://:9092
log.dirs=/tmp/kraft-combined-logs
```

- `log.dirs/__cluster_metadata-0/00000000000000000000.log` — log de metadados (KRaft) com
  os tópicos e partições;
- `log.dirs/<tópico>-<partição>/00000000000000000000.log` — mensagens da partição.

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

O tester gera os logs, escreve o `server.properties`, inicia o broker e age como cliente.

## Estrutura

- `your_program.sh` / `your_program.cmd` — compila e inicia o broker.
- `src/main/java/Main.java` — seu código.

A referência do protocolo é a documentação oficial: <https://kafka.apache.org/protocol>.
