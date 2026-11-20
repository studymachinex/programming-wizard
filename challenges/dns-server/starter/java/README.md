# Build your own DNS server — Java

Este é o repositório inicial do desafio **DNS Server** do Programming Wizard.

O programa fica em `src/main/java/Main.java`. O runner executa
`java -jar target/dns-server.jar --resolver 127.0.0.1:<porta>` e conversa com o servidor
via **UDP** na porta `2053`, enviando pacotes DNS em binário.

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

Para experimentar à mão com o `dig` (se instalado):

```bash
./your_program.sh &
dig @127.0.0.1 -p 2053 +noedns programming.wizard
```

## Estrutura

- `your_program.sh` / `your_program.cmd` — compila e inicia o servidor.
- `src/main/java/Main.java` — seu código.

Só a biblioteca padrão do Java é necessária (`java.net.DatagramSocket`).
