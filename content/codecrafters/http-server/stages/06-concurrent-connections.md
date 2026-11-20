O servidor precisa atender **duas conexões ao mesmo tempo**. Se você processa uma conexão até o fim dentro do `accept()`, a segunda fica esperando e o teste falha.

## O que você vai aprender

- por que o `accept()` loop não pode bloquear no processamento;
- thread por conexão vs. event loop;
- virtual threads do Java 21.

## O que fazer

Mova o processamento de cada cliente para uma thread separada:

```java
try (ServerSocket serverSocket = new ServerSocket(4221)) {
  while (true) {
    Socket client = serverSocket.accept();
    Thread.startVirtualThread(() -> handleConnection(client));
  }
}
```

Também funciona com um executor:

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
  while (true) {
    Socket client = serverSocket.accept();
    executor.submit(() -> handleConnection(client));
  }
}
```

## Como o tester valida

O tester abre duas conexões sem fechar a primeira, envia requests nas duas e espera receber as respostas corretas. Se a segunda conexão só for atendida depois de fechar a primeira, o stage falha.

## Dicas

- Feche cada socket no fim do `handleConnection` (ou quando a conexão for encerrada).
- Não compartilhe um `BufferedReader`/`OutputStream` entre conexões.
- Não use `Executors.newFixedThreadPool(1)`.
- Virtual threads são baratas e ideais para servidores I/O-bound como este.

## Critério de conclusão

Duas conexões abertas simultaneamente recebem resposta sem uma bloquear a outra.
