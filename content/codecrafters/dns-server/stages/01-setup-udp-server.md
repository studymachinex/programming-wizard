O tester inicia o seu programa e envia um pacote DNS via **UDP** para
`127.0.0.1:2053`. Para este stage, basta **responder qualquer coisa** — o conteúdo da
resposta vem nos próximos stages.

## O que você vai aprender

- a diferença entre UDP e TCP: sem conexão, cada pacote (datagrama) é independente;
- por que o DNS usa UDP: uma pergunta e uma resposta pequenas, sem handshake;
- como responder para o endereço de origem de um datagrama.

## O que fazer

1. Crie um `DatagramSocket` na porta `2053`, em `127.0.0.1`.
2. Em um loop infinito, receba um pacote com `receive()`.
3. Responda para `packet.getSocketAddress()` — o endereço de quem enviou.

O starter já traz esse código comentado:

```java
try (DatagramSocket server = new DatagramSocket(2053, InetAddress.getByName("127.0.0.1"))) {
  while (true) {
    byte[] buffer = new byte[512];
    DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
    server.receive(packet);

    byte[] response = new byte[512];
    server.send(new DatagramPacket(response, response.length, packet.getSocketAddress()));
  }
}
```

## Como o tester valida

- inicia o programa com `--resolver 127.0.0.1:<porta>` (você pode ignorar até o stage 8);
- envia uma consulta DNS para `127.0.0.1:2053`;
- espera receber uma resposta UDP com pelo menos 12 bytes.

## Dicas

- 512 bytes é o tamanho máximo clássico de uma mensagem DNS em UDP.
- `receive()` bloqueia até chegar um pacote; não precisa de threads.
- Mantenha o processo vivo: o tester envia vários pacotes ao longo dos stages.

## Critério de conclusão

Cada pacote enviado para a porta 2053 recebe uma resposta.
