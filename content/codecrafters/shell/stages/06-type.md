`type <nome>` diz **o que** um nome é. Por enquanto, só builtins:

```
$ type echo
echo is a shell builtin
$ type goiaba_9
goiaba_9: not found
```

## O que você vai aprender

- a manter uma lista central de builtins (você vai consultá-la em vários lugares).

## O que fazer

- builtin: `<nome> is a shell builtin`
- desconhecido: `<nome>: not found`

## Como o tester valida

- `type echo`, `type exit`, `type type`;
- `type <nome aleatório>`.

## Dicas

- Guarde os builtins num `Set`/`List` — o autocompletar (stage 23) vai usar a mesma lista.

## Critério de conclusão

`type` reconhece os builtins.
