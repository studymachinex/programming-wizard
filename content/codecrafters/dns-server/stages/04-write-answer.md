Agora a parte que importa: a **answer section**, com um registro A dizendo qual é o IP
de `programming.wizard`.

## O que você vai aprender

- o formato de um *resource record* (RR), usado em answers, autoridade e adicionais;
- o papel do TTL no cache de resolvers;
- como RDLENGTH permite que o parser pule dados de qualquer tipo.

## O formato

```text
NAME      nome codificado em labels (igual à question)
TYPE      2 bytes  — 1 (A)
CLASS     2 bytes  — 1 (IN)
TTL       4 bytes  — por quantos segundos a resposta pode ficar em cache
RDLENGTH  2 bytes  — tamanho de RDATA em bytes
RDATA     RDLENGTH bytes — para um registro A, os 4 bytes do IPv4
```

## O que fazer

1. Depois da question, escreva uma answer para `programming.wizard`:
   - TYPE `1`, CLASS `1`;
   - TTL `60`;
   - RDLENGTH `4`;
   - RDATA `8.8.8.8` → bytes `08 08 08 08`.
2. Atualize `ANCOUNT` para `1` no header.

```java
out.writeBytes(encodeName("programming.wizard"));
ByteBuffer rr = ByteBuffer.allocate(14);
rr.putShort((short) 1);  // TYPE A
rr.putShort((short) 1);  // CLASS IN
rr.putInt(60);           // TTL
rr.putShort((short) 4);  // RDLENGTH
rr.put(new byte[] {8, 8, 8, 8});
out.writeBytes(rr.array());
```

## Como o tester valida

- envia uma consulta para `programming.wizard`;
- confere `ANCOUNT = 1`;
- confere nome, TYPE `1`, CLASS `1` e RDLENGTH `4` da answer.

## Dicas

- O IP pode ser qualquer um; o tester não confere o valor até o stage 8.
- TTL é de 4 bytes (`putInt`), diferente dos outros campos de 2 bytes.
- Agora a sua resposta é uma mensagem DNS completa — teste com
  `dig @127.0.0.1 -p 2053 +noedns programming.wizard` se tiver o `dig`.

## Critério de conclusão

A resposta contém um registro A válido para `programming.wizard`.
