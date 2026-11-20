Um broker atende **muitos clientes ao mesmo tempo**. Se o seu loop de `accept()` trata
uma conexão até o fim antes de aceitar a próxima, o segundo cliente fica esperando.

## O que você vai aprender

- concorrência em servidores: uma thread (ou thread virtual) por conexão;
- o que pode e o que não pode ser compartilhado entre threads.

## O que fazer

Para cada conexão aceita, rode o loop do stage 6 em uma thread própria.

```java
while (true) {
  Socket client = server.accept();
  Thread.ofVirtual().start(() -> serve(client));
}
```

## Como o tester valida

- abre 3 conexões, envia um request em cada e lê as respostas em ordem inversa;
- repete duas vezes.

## Dicas

- Threads virtuais (Java 21) são baratas: uma por conexão é o caminho mais simples.

## Critério de conclusão

O broker atende vários clientes simultâneos.
