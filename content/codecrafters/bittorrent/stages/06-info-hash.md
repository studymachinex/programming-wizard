O **info hash** identifica o torrent em toda a rede: é como o cliente se apresenta ao
tracker e aos peers. Acrescente-o ao `info`:

```text
Info Hash: 8c1a2e4f0b7d93a6c5e1f2048d9b7a3e6c50f1d2
```

## O que você vai aprender

- que o identificador é o **SHA-1 do dicionário `info` bencodado**;
- por que o bencode precisa ser determinístico (chaves ordenadas, sem espaços).

## O que fazer

Duas formas, as duas válidas:

- **re-codificar**: escreva um encoder de bencode e codifique o dicionário `info`
  decodificado (com as chaves ordenadas por bytes);
- **recortar**: durante o decode, guarde em que posição o valor de `info` começa e termina
  no arquivo, e use esses bytes originais.

Depois calcule o SHA-1 e imprima em hexadecimal minúsculo.

```java
byte[] hash = MessageDigest.getInstance("SHA-1").digest(infoBytes);
String hex = HexFormat.of().formatHex(hash);
```

## Como o tester valida

- gera um torrent aleatório e compara a linha `Info Hash:` com o SHA-1 esperado.

## Dicas

- Se o hash não bate, o problema quase sempre é o encoder: ordem das chaves, ou `pieces`
  convertido para texto em algum ponto.

## Critério de conclusão

O info hash bate com o SHA-1 do dicionário `info`.
