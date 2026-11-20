Neste desafio você vai construir um **broker Kafka**: o servidor que recebe mensagens de
produtores, guarda em disco e entrega para consumidores. Tudo pelo protocolo binário do
Kafka, sobre TCP.

O tester inicia o broker com o caminho de um `server.properties`:

```bash
$ ./your_program.sh /tmp/server.properties
```

```properties
process.roles=broker,controller
node.id=1
listeners=PLAINTEXT://:9092
log.dirs=/tmp/kraft-combined-logs
```

## O que você vai aprender

- como um broker Kafka é configurado;
- a abrir um servidor TCP na porta pedida.

## O que fazer

1. Leia o arquivo com `java.util.Properties`.
2. Extraia a porta de `listeners` (o número depois do último `:`).
3. Abra um `ServerSocket` nessa porta e aceite conexões em loop.

O starter já lê o arquivo e traz o loop comentado.

## Como o tester valida

- escreve o `server.properties` (a porta pode não ser 9092 se ela estiver ocupada);
- inicia o broker e tenta conectar na porta de `listeners`.

## Dicas

- Guarde também `log.dirs`: os stages de tópicos e mensagens leem arquivos de lá.

## Critério de conclusão

O broker aceita conexões TCP na porta configurada.
