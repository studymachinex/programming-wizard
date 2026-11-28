> **Em uma frase:** uma imagem é uma pilha de camadas somente leitura, e o container enxerga a união delas mais uma camada gravável montada pelo OverlayFS, que copia o arquivo inteiro para cima ao escrever (*copy-up*) e esconde o que foi apagado com um *whiteout*.

## O problema

Você apaga um arquivo de 400 MB em um `RUN rm` do Dockerfile e a imagem **não encolhe**. Outro time baixa 275 MB a cada build porque uma linha de código mudou. Um terceiro roda um banco de dados dentro do container e vê a escrita ficar lenta e o disco do host crescer em `/var/lib/docker`, sem que nenhum volume exista.

As três situações têm a mesma raiz: o sistema de arquivos de um container **não é um disco**. É a soma de camadas imutáveis com uma camada de escrita, e cada operação (ler, escrever, apagar) tem uma regra própria. Quem conhece a regra projeta Dockerfiles menores e sabe quando usar volume.

## Como funciona

Cada instrução do Dockerfile que altera arquivos (`FROM`, `COPY`, `ADD`, `RUN`) gera uma **camada**: um conjunto de arquivos adicionados, alterados ou removidos em relação à camada anterior. Instruções como `ENV`, `CMD`, `EXPOSE` e `LABEL` só mudam a config da imagem, sem camada de arquivos. As camadas são **somente leitura**, endereçadas por digest, e compartilhadas por todas as imagens e containers que as usam.

Para montar a visão que o processo enxerga, o Linux usa o **OverlayFS**. Ele combina diretórios em um ponto de montagem:

- **`lowerdir`**: as camadas da imagem, somente leitura (de uma a muitas);
- **`upperdir`**: a camada gravável, só deste container;
- **`workdir`**: um diretório auxiliar do kernel, no mesmo sistema de arquivos do `upperdir`;
- **`merged`**: o resultado, o `/` que o container usa.

As regras de cada operação:

- **Leitura.** O kernel procura o arquivo de cima para baixo e usa a **primeira** camada que o tenha. Ler é barato: não copia nada.
- **Escrita.** O arquivo está numa camada de baixo e ela não pode mudar. O OverlayFS faz um **copy-up**: copia o arquivo **inteiro** para o `upperdir` e altera a cópia. Um arquivo grande alterado em um byte custa a cópia dele inteiro, uma única vez.
- **Remoção.** Não dá para apagar de uma camada de baixo. O `upperdir` ganha um **whiteout**: um arquivo especial, do tipo **dispositivo de caractere com número 0/0**, com o mesmo nome do arquivo apagado. Na visão unificada, o original some, mas continua ocupando espaço na imagem. No tar de uma camada de imagem, a mesma marca é um arquivo chamado `.wh.<nome>`.
- **Diretório recriado.** Se você apaga um diretório e cria outro com o mesmo nome, o novo é marcado como **opaco** (atributo `trusted.overlay.opaque`): o que havia embaixo dele não reaparece.

O Docker clássico guarda tudo isso em `/var/lib/docker/overlay2`. As versões recentes, com o *containerd image store*, usam o *snapshotter* `overlayfs`, com a mesma ideia e outro layout em disco. `docker inspect` mostra os caminhos de um container no campo `GraphDriver.Data` (`LowerDir`, `UpperDir`, `WorkDir`, `MergedDir`).

## Na prática

Você consegue reproduzir o OverlayFS sem Docker, com quatro diretórios (em Linux, como root; aqui dentro de um container privilegiado só para testar):

```bash
mkdir -p base/etc base/usr/share/doc upper work merged
echo "debug=false" > base/etc/app.conf
echo "leia-me"     > base/usr/share/doc/readme

mount -t overlay overlay -o lowerdir=base,upperdir=upper,workdir=work merged

echo "debug=true" > merged/etc/app.conf   # copy-up
cat base/etc/app.conf                      # continua "debug=false"
find upper -type f                         # upper/etc/app.conf

rm -r merged/usr/share/doc                 # whiteout
ls -l upper/usr/share                      # c---------  ...  0, 0  doc
```

Os dois últimos comandos são o ponto: a `base` não mudou, o `upperdir` guarda o arquivo copiado e um dispositivo de caractere `0, 0` chamado `doc`. Para ver o mesmo em um container real e as camadas de uma imagem:

```bash
docker history loja/app:1.0
docker image inspect loja/app:1.0 --format '{{json .RootFS.Layers}}'
docker diff web
```

O `docker diff` mostra o que está na camada gravável: `A` (adicionado), `C` (alterado) e `D` (removido). E o Dockerfile deve respeitar a regra do **cache em cascata**: invalidou uma camada, todas as de cima são refeitas. Ordene do que muda menos para o que muda mais, e remova lixo na **mesma** instrução em que ele foi criado:

```dockerfile
COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src
RUN mvn -B -o package

RUN apt-get update && apt-get install -y curl \
    && rm -rf /var/lib/apt/lists/*
```

O `pom.xml` muda pouco, então as duas primeiras instruções ficam em cache enquanto ele não mudar; o código muda a cada commit e vem por último. A última instrução cria e apaga na **mesma** camada: apagar em outro `RUN` não encolheria a imagem.

## Armadilhas comuns

- **Apagar um arquivo grande em um `RUN` posterior.** O whiteout esconde o arquivo, mas a camada que o criou continua na imagem e é baixada. Crie e apague na mesma instrução, ou use build multi-stage.
- **Banco de dados na camada gravável.** Cada página alterada de um arquivo grande dispara copy-up, e o desempenho cai. Dados que importam vão em **volume** (módulo de storage).
- **Copiar tudo com `COPY . .` antes de resolver as dependências.** Uma linha de código muda o conteúdo do `COPY`, invalida o cache e refaz o download das dependências em todo build.
- **Achar que o container "duplica" a imagem.** Não duplica: containers da mesma imagem compartilham as camadas de baixo. O que cresce é a camada de cada um.
- **Confiar em arquivos temporários na camada gravável.** Logs e arquivos de upload grandes enchem o `upperdir` e o disco do host. Use `tmpfs` para temporários e `stdout` para logs.

## Checklist de domínio

- [ ] Você descreve `lowerdir`, `upperdir`, `workdir` e `merged` e o que cada um guarda
- [ ] Você explica o copy-up e por que ele pesa em arquivos grandes
- [ ] Você sabe o que é um whiteout (dispositivo de caractere 0/0) e um diretório opaco
- [ ] Você ordena um Dockerfile para aproveitar o cache de camadas
- [ ] Você explica por que apagar em um `RUN` posterior não reduz a imagem

## Para ir além

- [Docker: o driver de armazenamento OverlayFS](https://docs.docker.com/engine/storage/drivers/overlayfs-driver/)
- [Docker: sobre os drivers de armazenamento](https://docs.docker.com/engine/storage/drivers/)
- [Kernel: Overlay Filesystem](https://docs.kernel.org/filesystems/overlayfs.html)
- [Docker: melhores práticas de build](https://docs.docker.com/build/building/best-practices/)
