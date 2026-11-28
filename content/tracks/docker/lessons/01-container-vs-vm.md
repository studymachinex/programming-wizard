> **Em uma frase:** uma VM virtualiza o hardware e leva um sistema operacional inteiro com o seu próprio kernel; um container virtualiza o sistema operacional e é só um processo do host, com visão e recursos limitados, que usa o mesmo kernel de todos os outros.

## O problema

"Funciona na minha máquina" é a queixa clássica, e a primeira resposta da indústria foi a **máquina virtual**: empacotar a aplicação junto com o sistema operacional, as bibliotecas e a configuração. Funciona, e ainda é como a nuvem pública isola clientes entre si. O custo é conhecido: cada aplicação carrega um SO completo, o boot leva de segundos a minutos, a imagem pesa gigabytes e cada VM precisa de atualizações de segurança próprias.

Quando o assunto é rodar dezenas de serviços pequenos na mesma máquina, esse custo fixo domina a conta. A pergunta que dá origem aos containers é: **precisamos de um kernel por aplicação, ou só de uma visão separada do mesmo kernel?** Responder bem a essa pergunta evita três erros de produção: tratar o container como uma VM pequena, confiar nele como fronteira de segurança absoluta e se surpreender quando "Linux nativo" no notebook com Mac ou Windows não é nativo.

## Como funciona

Numa **VM**, um **hypervisor** (KVM, Hyper-V, VMware, Xen) reparte CPU, memória e disco e apresenta a cada VM um hardware virtual. Dentro de cada VM roda um sistema operacional completo, com kernel, serviços de sistema e um sistema de arquivos próprio. O kernel de uma VM não enxerga o da outra.

Num **container**, não existe hardware virtual nem segundo kernel. O kernel do host cria, para o processo, uma **visão restrita** (namespaces: o que o processo enxerga) e um **teto de recursos** (cgroups: quanto ele pode usar). A próxima aula abre essas duas peças. Do ponto de vista do host, o processo do container aparece num `ps` normal.

| | VM | Container |
|---|---|---|
| Kernel | um por VM | um só, do host |
| Unidade de isolamento | hardware virtual | namespaces e cgroups |
| Tempo para ficar pronto | segundos a minutos | uma fração de segundo |
| Tamanho típico da imagem | gigabytes | de poucos MB a algumas centenas de MB |
| Isolamento de segurança | forte (precisa passar pelo hypervisor) | mais fraco (superfície é o kernel) |
| Roda outro SO? | sim | não: usa o kernel do host |

A última linha da tabela é a mais importante. A **imagem de um container não traz kernel**: só os arquivos do userspace (bibliotecas, binários, configuração). Por isso um container Linux precisa de um kernel Linux. No Windows e no Mac, o **Docker Desktop** cria uma **VM Linux leve** (no Windows, geralmente sobre o WSL 2) e roda o Docker dentro dela. Os containers continuam sendo processos, mas de um kernel Linux que está dentro da VM. Existem também *containers do Windows*, que usam o kernel do Windows, mas são outro ecossistema e quase nunca o que o seu backend Java usa.

Entre os dois mundos há opções híbridas. **Kata Containers** e **Firecracker** colocam cada container (ou função) em uma microVM mínima. O **gVisor** intercepta as chamadas de sistema do container e as trata em um kernel de usuário. Quem roda código de terceiros no mesmo servidor costuma escolher uma delas, justamente por causa da última linha da tabela.

## Na prática

Comprove que o kernel é compartilhado. Em um host Linux, o resultado é idêntico dentro e fora do container:

```bash
uname -r
docker run --rm alpine uname -r

docker run --rm alpine cat /etc/os-release | head -2
docker info --format '{{.OSType}} {{.KernelVersion}} {{.Architecture}}'
```

O `alpine` tem outro **userspace** (`/etc/os-release` diz Alpine Linux), mas o **kernel** é o do host. Quem usa Docker Desktop vê o kernel da VM, e não o do Mac ou do Windows. Para ver o processo do container no host, em Linux:

```bash
docker run -d --name web nginx:1.27
ps -eo pid,ppid,comm | grep nginx
docker rm -f web
```

O `nginx` aparece com um PID do host. Dentro do container ele é o PID 1 (aula 2). A consequência prática é o monitoramento: o `top` do host mostra o uso de CPU de todos os containers, e o limite de um container só existe se alguém o configurou com `--cpus` e `-m`.

## Armadilhas comuns

- **Tratar o container como uma VM pequena.** Instalar `sshd`, `cron` e vários serviços no mesmo container cria um sistema que ninguém consegue reproduzir. A regra é **um processo principal por container**.
- **Confiar no container como fronteira de segurança.** Um bug no kernel serve a todos os containers do host. Para cargas que não são confiáveis, combine containers com VMs, usuário não-root, perfis seccomp e, se preciso, runtimes como gVisor ou Kata.
- **Arquitetura errada.** Uma imagem `linux/amd64` rodando num Mac com chip Apple passa por emulação (lenta) ou falha com `exec format error`. Construa imagens multi-arquitetura ou fixe a plataforma no CI.
- **Esperar desempenho de disco igual ao nativo no Mac e no Windows.** Os bind mounts atravessam a VM, e isso pesa em projetos com milhares de arquivos pequenos (`node_modules`, por exemplo).
- **Depender de recursos do kernel que o host não tem.** O container herda a versão do kernel: um recurso novo (cgroups v2, certos hooks de eBPF) só existe se o host o oferecer.

## Checklist de domínio

- [ ] Você explica a diferença entre virtualizar hardware e virtualizar o sistema operacional
- [ ] Você sabe por que uma imagem não traz kernel e o que isso implica no Mac e no Windows
- [ ] Você comprova com `uname -r` que o kernel é compartilhado
- [ ] Você diz quando faz sentido combinar containers e VMs
- [ ] Você enumera três razões pelas quais "container não é uma VM leve"

## Para ir além

- [Docker: primeiros passos](https://docs.docker.com/get-started/)
- [Docker Desktop: como funciona no Windows (WSL 2)](https://docs.docker.com/desktop/features/wsl/)
- [Containers vs VMs: o que são containers](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/)
- [Open Container Initiative: sobre](https://opencontainers.org/about/overview/)
