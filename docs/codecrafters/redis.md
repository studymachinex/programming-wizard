# Redis — progresso e próximos passos

**Status:** 🟡 3/124 stages · próximo: **#zu2 — Handle concurrent clients**.

- Desafio original: <https://app.codecrafters.io/courses/redis/overview>
- Clone usado no desenvolvimento: um clone externo do curso Redis, não versionado neste repositório.
- Catálogo completo de stages: [`content/codecrafters/catalog.json`](../../content/codecrafters/catalog.json)

## Core (1–7)

- [x] 1. Bind to a port — `ServerSocket` em `6379` com `SO_REUSEADDR`.
- [x] 2. Respond to PING — responde `+PONG\r\n`.
- [x] 3. Respond to multiple PINGs (#wy1) — loop na mesma conexão.
- [ ] 4. Handle concurrent clients — atender vários clientes ao mesmo tempo.
- [ ] 5. Implement the ECHO command — `ECHO <msg>` → bulk string.
- [ ] 6. Implement the SET & GET commands — armazenamento em memória.
- [ ] 7. Expiry — `PX`/`EX`, expiração preguiçosa/ativa.

## O que foi feito no stage #wy1

O `Main.java` do clone local foi alterado para:

1. aceitar a conexão e **manter o loop** até o cliente fechar;
2. ler comandos no formato **RESP array** (`*1\r\n$4\r\nPING\r\n`);
3. também aceitar o formato **inline** (`PING\r\n`);
4. responder `+PONG\r\n` para **cada** PING, inclusive quando vários chegam
   no mesmo pacote TCP;
5. devolver `-ERR unknown command\r\n` para outros comandos por enquanto.

O parser mínimo está em `readCommand` e já lida com fragmentação:
lê o array, o bulk string e consome o CRLF. Isso evita o bug clássico de
responder uma vez por `read()` em vez de uma vez por comando.

### Verificação feita

```text
pipelined:  "+PONG\r\n+PONG\r\n"   # duas PINGs na mesma escrita
sequential: "+PONG\r\n"            # mais uma PING na mesma conexão
inline:     "+PONG\r\n+PONG\r\n"   # PING\r\nPING\r\n
```

### Como submeter

O clone já está com a alteração local (working tree suja de propósito).
Escolha uma das opções:

```bash
cd ../codecrafters-redis-java   # clone externo do desafio
git add src/main/java/Main.java
git commit -m "pass stage #wy1: respond to multiple PINGs"
git push origin master
```

ou, com o CLI instalado:

```bash
codecrafters submit
```

## Próximo stage (#zu2 — concurrent clients)

O código atual ainda atende **um cliente por vez**: `handleClient` é chamado
dentro do `while` do `accept()`. Para o stage 4:

- criar uma thread (ou virtual thread) por cliente;
- manter o estado compartilhado (mapa de chaves) com segurança;
- garantir que o fechamento de um cliente não derrube os outros;
- testar com dois clientes simultâneos enviando PING.

Sugestão de estrutura para os próximos stages:

```text
Main.java          → accept loop + thread por cliente
RespReader.java    → parser/encoder RESP
Command.java       → nome + argumentos
CommandRouter.java → PING, ECHO, SET, GET, ...
Store.java         → mapa concorrente + expiração
```

## Seções restantes

| Seção | Stages | Status | Observações |
|---|---:|---|---|
| Lists | 11 | ⬜ | RPUSH, LRANGE, LPUSH, LLEN, LPOP, BLPOP |
| Streams | 13 | ⬜ | XADD, XRANGE, XREAD, IDs, blocking |
| Transactions | 11 | ⬜ | INCR, MULTI, EXEC, DISCARD |
| Optimistic Locking | 8 | ⬜ | WATCH/UNWATCH |
| Replication | 18 | ⬜ | handshake, propagação, ACK, WAIT |
| RDB Persistence | 6 | ⬜ | parsing de arquivo RDB |
| AOF Persistence | 10 | ⬜ | append-only file e replay |
| Pub/Sub | 7 | ⬜ | SUBSCRIBE, PUBLISH |
| Sorted Sets | 8 | ⬜ | ZADD, ZRANGE, scores |
| Bitmaps | 9 | ⬜ | SETBIT, BITCOUNT, AND/OR |
| Geospatial | 8 | ⬜ | GEOADD, GEOPOS, distância |
| Authentication | 8 | ⬜ | ACL, AUTH |

## Ordem sugerida dentro do Redis

1. **Core + concorrência** (4–7): fecha o "Redis básico".
2. **Lists + Transactions**: estruturas e comandos com estado.
3. **Streams + Pub/Sub**: modelos de dados e entrega de mensagens.
4. **Sorted Sets + Bitmaps + Geo**: estruturas especiais.
5. **RDB + AOF**: persistência.
6. **Replication + Authentication**: o bloco mais avançado.

## O que falta para a plataforma

- starter repo Java com `your_program.sh`/`pom.xml` e README;
- instruções dos 124 stages em português (começar pelo core);
- runner isolado que sobe o servidor, espera a porta 6379 e executa os testes;
- progresso por stage no banco (hoje o controle é este markdown).
