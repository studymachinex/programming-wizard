Até aqui o seu servidor inventava os IPs. Agora ele vira um **forwarder**: encaminha cada
pergunta para outro servidor DNS (o resolver) e devolve as respostas reais.

O endereço do resolver chega pela linha de comando:

```bash
./your_program.sh --resolver 127.0.0.1:5354
```

## O que você vai aprender

- como resolvers encadeiam consultas (o seu roteador faz isso com o DNS do provedor);
- a agir como **cliente** e **servidor** UDP ao mesmo tempo;
- a juntar várias respostas em uma única mensagem.

## O que fazer

1. Leia `--resolver <ip>:<porta>` dos argumentos.
2. Para cada question do request:
   - monte uma consulta com **uma única question** (o resolver não aceita mais de uma);
   - copie o ID e o RD do request original;
   - envie para o resolver por um socket UDP separado e espere a resposta;
   - faça o parsing da answer section da resposta.
3. Responda ao cliente com todas as questions e todas as answers coletadas, com o header
   montado como no stage 5.

```java
try (DatagramSocket client = new DatagramSocket()) {
  client.setSoTimeout(3000);
  client.send(new DatagramPacket(query, query.length, resolverAddress));
  byte[] buffer = new byte[512];
  DatagramPacket reply = new DatagramPacket(buffer, buffer.length);
  client.receive(reply);
  // parse das answers de reply
}
```

## Como o tester valida

- sobe um resolver falso que responde cada nome com um IP específico e TTL 120, mas
  responde **FORMERR** (RCODE 1, sem answers) a pacotes com mais de uma question;
- envia uma consulta com 1 question: confere que o resolver recebeu a consulta e que o IP
  da answer é o que ele respondeu;
- envia uma consulta com 2 questions (com compressão): espera 2 answers com os IPs do
  resolver para cada nome.

## Dicas

- Use um socket novo para falar com o resolver; o socket do servidor continua livre para
  responder o cliente original.
- Faça o parsing das answers e reescreva os nomes por extenso na sua resposta: ponteiros
  de compressão da resposta do resolver apontam para offsets **daquele** pacote.
- Com `setSoTimeout`, um resolver que não responde vira uma exceção, não um travamento.
- Para OPCODE ≠ 0, continue respondendo RCODE 4 sem consultar o resolver.

## Critério de conclusão

As answers vêm do resolver, uma consulta por pergunta, reunidas em uma única resposta.
