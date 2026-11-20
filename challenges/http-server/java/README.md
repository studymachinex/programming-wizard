# Build Your Own HTTP Server — Java

Este é o starter repo de referência para o desafio
[Build Your Own HTTP Server](https://app.codecrafters.io/courses/http-server/overview)
do CodeCrafters.

- **Ponto de entrada:** `src/main/java/Main.java`
- **Guia dos stages:** [`../../../docs/codecrafters/http-server.md`](../../../docs/codecrafters/http-server.md)
- **Roadmap geral:** [`../../../docs/codecrafters/ROADMAP.md`](../../../docs/codecrafters/ROADMAP.md)

## Rodar localmente

```bash
mvn -q -B package
java -jar target/http-server.jar --directory C:\tmp\data
```

Ou use os scripts:

```bash
./your_program.sh          # Unix
your_program.cmd           # Windows
```

## Estrutura no estilo CodeCrafters

```text
codecrafters.yml           # configuração da linguagem
.codecrafters/compile.sh   # como compilar no runner
.codecrafters/run.sh       # como executar no runner
your_program.sh            # atalho local (Unix)
your_program.cmd           # atalho local (Windows)
```

O servidor escuta na porta **4221** e aceita `--directory <pasta>` para os
stages de arquivos. A implementação cobre os 14 stages; detalhes de cada um
estão no guia linkado acima.
