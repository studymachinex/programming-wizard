# Build your own Redis — Java

Este é o repositório inicial do desafio **Redis** do Programming Wizard.

Você vai construir um servidor que fala o protocolo do Redis (RESP): PING/ECHO, strings com
expiração, listas com `BLPOP`, streams com `XREAD BLOCK`, transações e `WATCH`, replicação
master/réplica com `WAIT`, leitura de RDB, persistência AOF, pub/sub, sorted sets, bitmaps,
comandos geoespaciais e autenticação com ACL.

```bash
./your_program.sh --port 6380
./your_program.sh --port 6381 --replicaof "localhost 6380"
./your_program.sh --dir /tmp/dados --dbfilename dump.rdb
./your_program.sh --appendonly yes
redis-cli -p 6380 SET fruta manga
```

O tester sempre passa `--port` com uma porta livre, então ele não conflita com um Redis que
esteja rodando na 6379. Os arquivos RDB/AOF e os papéis de master/réplica nos testes de
replicação são simulados pelo próprio tester.

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

## Estrutura

- `your_program.sh` / `your_program.cmd` — compila e executa o servidor.
- `src/main/java/Main.java` — seu código (crie as classes que quiser).
