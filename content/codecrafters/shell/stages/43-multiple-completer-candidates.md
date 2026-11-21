Vários candidatos vindos do completer seguem a mesma regra: BEL, depois lista ordenada.

## O que você vai aprender

- que o motor de completação é um só, independente da fonte dos candidatos.

## O que fazer

Passe os candidatos do completer pela mesma lógica dos stages 27 e 33.

## Como o tester valida

- `deploy s` + Tab → BEL; Tab → `sandbox  staging  sync`.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Vários candidatos do completer são listados.
