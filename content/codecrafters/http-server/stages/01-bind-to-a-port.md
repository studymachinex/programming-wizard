O tester vai iniciar o seu programa com `./your_program.sh` e, em seguida, tentar abrir uma conexão TCP em `127.0.0.1:4221`. Para este stage, **a conexão precisa ser aceita** — não é necessário responder nada ainda.

## O que você vai aprender

- como um servidor TCP escuta em uma porta;
- a diferença entre `bind`, `listen` e `accept`;
- por que o processo precisa continuar vivo depois de aceitar uma conexão.

## O que fazer

1. Crie um `ServerSocket` na porta `4221`.
2. Entre em um loop infinito chamando `accept()`.
3. Para cada conexão aceita, mantenha o socket aberto pelo tempo necessário (no próximo stage você vai escrever a resposta).
4. Garanta que o processo não termina depois de aceitar a primeira conexão.

Em Java, a base é parecida com isto:

```java
try (ServerSocket serverSocket = new ServerSocket(4221)) {
  while (true) {
    Socket client = serverSocket.accept();
    // trate a conexão
  }
}
```

## Como o tester valida

- inicia o programa;
- espera a porta `4221` ficar disponível;
- abre uma conexão TCP;
- considera o stage concluído se a conexão for aceita.

## Dicas

- Se a porta já estiver em uso, o `ServerSocket` lança `BindException`. Feche servidores antigos antes de testar.
- Não feche o `ServerSocket` no `finally` enquanto o loop estiver rodando.
- `SO_REUSEADDR` ajuda a evitar `Address already in use` entre execuções.

## Critério de conclusão

O teste do stage 1 passa e o servidor continua escutando depois da primeira conexão.
