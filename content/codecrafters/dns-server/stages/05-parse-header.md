Até aqui a resposta era fixa. Agora o servidor passa a **ler o header do request** e
copiar dele os campos que identificam a consulta.

## O que você vai aprender

- a extrair campos de bits com deslocamento e máscara;
- por que o ID precisa ser copiado: é como o cliente associa a resposta à pergunta;
- o que é o RCODE e quando responder "não implementado".

## O que fazer

Leia os 12 primeiros bytes do pacote recebido e monte a resposta assim:

| Campo | Valor na resposta |
|---|---|
| ID | o mesmo do request |
| QR | `1` |
| OPCODE | o mesmo do request |
| AA, TC, RA, Z | `0` |
| RD | o mesmo do request |
| RCODE | `0` se OPCODE = 0 (consulta padrão); senão `4` (*not implemented*) |

```java
int id = ((request[0] & 0xff) << 8) | (request[1] & 0xff);
int flags = ((request[2] & 0xff) << 8) | (request[3] & 0xff);
int opcode = (flags >> 11) & 0x0f;
boolean rd = (flags & 0x0100) != 0;
int rcode = opcode == 0 ? 0 : 4;
```

Question e answer continuam fixas em `programming.wizard` neste stage.

## Como o tester valida

- envia uma consulta com ID aleatório e `RD = 1`: confere ID, `RD = 1`, `OPCODE = 0` e
  `RCODE = 0`;
- envia outra com `OPCODE = 2` e `RD = 0`: confere ID, `OPCODE = 2`, `RD = 0` e `RCODE = 4`.

## Dicas

- Em Java `byte` tem sinal: use `& 0xff` antes de deslocar, senão bytes ≥ 128 viram
  números negativos.
- Monte as flags da resposta juntando os campos com `|`:
  `0x8000 | (opcode << 11) | (rd ? 0x0100 : 0) | rcode`.
- Parsear o header em um `record Header(...)` deixa os próximos stages bem mais simples.

## Critério de conclusão

A resposta espelha ID, OPCODE e RD do request e sinaliza OPCODEs não suportados.
