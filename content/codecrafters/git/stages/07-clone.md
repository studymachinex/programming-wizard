Implemente `clone <url> <diretório>`: baixe um repositório remoto pelo protocolo
**smart HTTP**, grave todos os objetos e faça checkout do último commit.

```bash
$ /caminho/para/your_program.sh clone http://127.0.0.1:8080/sample.git cloned
$ cd cloned && git log --oneline
```

Este é o stage mais longo do desafio: ele junta tudo o que você fez até aqui com o
protocolo de rede e o formato de packfile.

## O que você vai aprender

- como `git clone` conversa com o servidor: descoberta de refs e negociação;
- o formato **pkt-line** usado em todo o protocolo;
- o formato **packfile** e como deltas economizam espaço.

## Passo 1 — descobrir as refs

```http
GET <url>/info/refs?service=git-upload-pack
```

A resposta é uma sequência de *pkt-lines*: 4 caracteres hexadecimais com o tamanho da
linha (incluindo os próprios 4) seguidos do conteúdo. `0000` é um *flush*.

```text
001e# service=git-upload-pack\n
0000
00f1<sha> HEAD\0multi_ack ... symref=HEAD:refs/heads/main ...\n
003f<sha> refs/heads/main\n
0000
```

Guarde o SHA de `HEAD` e o nome da branch (`symref=HEAD:refs/heads/<branch>`).

## Passo 2 — pedir o packfile

```http
POST <url>/git-upload-pack
Content-Type: application/x-git-upload-pack-request

0032want <sha>\n
00000009done\n
```

A resposta começa com `0008NAK\n` e em seguida vêm os bytes do packfile (`PACK...`).

## Passo 3 — ler o packfile

```text
"PACK" | versão (4 bytes) | quantidade de objetos (4 bytes, big-endian) | objetos... | SHA-1
```

Cada objeto começa com um cabeçalho de tamanho variável:

- primeiro byte: bit 7 = continua?, bits 6–4 = tipo, bits 3–0 = início do tamanho;
- bytes seguintes: bit 7 = continua?, 7 bits de tamanho (little-endian).

Tipos: `1` commit, `2` tree, `3` blob, `4` tag, `6` OFS_DELTA, `7` REF_DELTA.

Depois do cabeçalho vêm os dados comprimidos com zlib. **O pack não informa o tamanho
comprimido**: use `Inflater` e veja quantos bytes ele consumiu (`getBytesRead()`).

## Passo 4 — aplicar deltas

Objetos delta guardam só a diferença em relação a um objeto base:

- `REF_DELTA` (7): 20 bytes com o SHA da base;
- `OFS_DELTA` (6): um offset negativo, relativo ao início deste objeto no pack.

Os dados descomprimidos do delta são: tamanho da base (varint), tamanho final (varint) e
uma lista de instruções:

- **copy** (bit 7 = 1): bits 0–3 dizem quais bytes de offset vêm a seguir; bits 4–6, quais
  bytes de tamanho. Copia `tamanho` bytes da base a partir de `offset` (tamanho 0 = 65536).
- **insert** (bit 7 = 0): os próximos `n` bytes (n = valor do byte) vão direto para a saída.

O objeto resultante tem o mesmo tipo da base.

## Passo 5 — checkout

1. Rode o equivalente ao `init` dentro do diretório de destino.
2. Grave cada objeto com o `writeObject` dos stages anteriores.
3. Escreva `.git/refs/heads/<branch>` com o SHA de HEAD e `.git/HEAD` apontando para ela.
4. Leia o commit → tree → percorra recursivamente criando diretórios e arquivos.

## Como o tester valida

- sobe um servidor smart HTTP local (`git http-backend`) com um repositório de 5 commits,
  diretórios aninhados e arquivos parecidos, compactado para gerar deltas;
- roda `clone http://127.0.0.1:<porta>/wizard-sample.git cloned`;
- confere com o git real: HEAD, todos os objetos alcançáveis, 5 commits no log e o
  conteúdo de cada arquivo do working tree.

## Dicas

- `java.net.http.HttpClient` resolve a parte de rede, sem dependências.
- Pedir a capability `ofs-delta` (`want <sha> ofs-delta\n`) faz o servidor mandar
  `OFS_DELTA`; sem ela, você recebe `REF_DELTA`. Implemente os dois.
- Uma base pode ser ela mesma um delta: resolva em ordem, guardando objetos por offset e
  por SHA.
- Não é preciso criar o index (`.git/index`); o tester não roda `git status`.

## Critério de conclusão

O git real reconhece o clone como cópia completa do repositório remoto.
