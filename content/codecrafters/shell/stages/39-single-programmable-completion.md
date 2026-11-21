Agora o completer entra em ação. Ao completar um argumento de um comando registrado, o shell
**executa o completer** e lê do stdout dele os candidatos, um por linha.

O completer recebe três argumentos: o nome do comando, a palavra sendo completada e a palavra
anterior a ela (o stage 41 testa isso em detalhe).

## O que você vai aprender

- a capturar a saída de um processo (`process.getInputStream()`).

## O que fazer

1. Se a primeira palavra tem completer registrado, rode `<completer> <comando> <palavra> <anterior>`.
2. Cada linha não vazia da saída é um candidato.
3. Um candidato → substitua a palavra por ele + espaço.

## Como o tester valida

- registra um completer que sabe `staging`, `production` e `preview`;
- `deploy st` + Tab → `$ deploy staging `;
- `deploy --env pro` + Tab → `$ deploy --env production `.

## Dicas

- O próprio completer filtra pela palavra atual; o shell usa a saída como veio.
- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Tab usa o completer registrado.
