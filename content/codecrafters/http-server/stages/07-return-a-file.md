Implemente `GET /files/{nome}` para servir arquivos de um diretório configurado pela flag `--directory`.

O runner inicia o programa assim:

```bash
./your_program.sh --directory /tmp/some-directory
```

O tester cria um arquivo `hello.txt` nesse diretório e faz:

```http
GET /files/hello.txt HTTP/1.1
```

Resposta esperada: status `200` e o conteúdo do arquivo no body. Para um arquivo inexistente, `404`.

## O que você vai aprender

- argumentos de linha de comando;
- leitura de arquivos com `Files.readAllBytes`;
- path traversal e por que `normalize()` + `startsWith()` importam.

## O que fazer

1. Leia `--directory <path>` no `main`. Guarde o caminho absoluto normalizado.
2. Se o path começar com `/files/`, extraia o nome.
3. Resolva o arquivo dentro do diretório base.
4. Se existir e for um arquivo regular, leia os bytes e responda `200` com `Content-Type: application/octet-stream` e `Content-Length`.
5. Se não existir, responda `404`.
6. Bloqueie tentativas de sair do diretório, como `/files/../../etc/passwd`.

```java
Path base = Paths.get(directory).toAbsolutePath().normalize();
Path file = base.resolve(name).normalize();
if (!file.startsWith(base)) {
  // 404
}
```

## Como o tester valida

- cria `hello.txt` com `Hello, World!`;
- `GET /files/hello.txt` → `200`, body `Hello, World!`;
- `GET /files/does-not-exist.txt` → `404`.

## Dicas

- `Files.exists` + `Files.isRegularFile` evita tentar ler diretórios.
- O nome pode conter subdiretórios. Normalize antes de validar.
- Não use `new File(base, name)` sem validar o caminho final.
- A flag pode vir em qualquer posição; faça um loop pelos argumentos.

## Critério de conclusão

Arquivos existentes são servidos e arquivos ausentes retornam `404`.
