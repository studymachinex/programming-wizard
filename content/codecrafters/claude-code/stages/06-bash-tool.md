Com um shell, o agente roda testes, compila, usa git... Adicione a ferramenta `bash`.

## O que você vai aprender

- a executar processos e capturar a saída;
- por que o **código de saída** é tão importante quanto a saída para o modelo;
- as diferenças entre shells em Linux/macOS e Windows.

## O que fazer

1. Anuncie `bash` com o parâmetro obrigatório `command`.
2. Ao executar:
   - rode o comando **no diretório do projeto**;
   - em Linux/macOS use `sh -c "<command>"`; no Windows, `cmd.exe /c "<command>"`;
   - junte stdout e stderr;
   - devolva o código de saída e a saída, por exemplo:

```text
exit code: 0
saída do comando...
```

```java
ProcessBuilder builder = windows
    ? new ProcessBuilder("cmd.exe", "/d", "/s", "/c", command)
    : new ProcessBuilder("sh", "-c", command);
builder.directory(cwd.toFile()).redirectErrorStream(true);
```

## Como o tester valida

- confere o anúncio de `bash` com `command` obrigatório;
- o modelo roda um comando `node -e ...` que lê um arquivo do projeto (verifica o diretório);
- depois roda um comando que termina com código 3 e espera `exit code: 3` no resultado.

## Dicas

- Leia a saída **antes** de `waitFor()`, senão processos com muita saída travam.
- Ponha um timeout (ex.: 60 s) e devolva um erro se ele estourar.
- Um código de saída diferente de zero não é erro do agente: é informação para o modelo.

## Critério de conclusão

O modelo consegue rodar comandos e ver saída e código de saída.
