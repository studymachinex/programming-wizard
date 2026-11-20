Clientes Kafka mantêm a conexão aberta e mandam **vários requests** por ela.

## O que você vai aprender

- conexões persistentes: o servidor lê requests em loop até o cliente fechar;
- por que o `message_size` é indispensável: é ele que separa uma mensagem da próxima.

## O que fazer

Transforme o tratamento da conexão em um loop: ler `message_size`, ler o request,
responder, repetir. Termine quando o cliente fechar a conexão (`EOFException`).

## Como o tester valida

- envia de 3 a 5 requests ApiVersions em sequência na mesma conexão;
- confere cada resposta (com `correlation_id` diferente em cada uma).

## Critério de conclusão

O broker atende vários requests na mesma conexão.
