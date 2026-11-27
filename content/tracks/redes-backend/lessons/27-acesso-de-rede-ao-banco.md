> **Em uma frase:** o banco vive numa subnet privada, sem IP público, e só aceita conexões na porta 5432 vindas do security group da aplicação; o acesso humano passa por bastion, SSM ou túnel SSH, o tráfego vai cifrado (`sslmode=verify-full`), e um destino que descarta pacotes em silêncio aparece como timeout, não como "connection refused".

## O problema

Um banco Postgres foi criado com "acesso público" para facilitar o desenvolvimento: tem IP público e o security group libera a porta 5432 para `0.0.0.0/0`. Em poucos dias, o log de autenticação mostra milhares de tentativas de login vindas de endereços do mundo todo, e um dia uma senha fraca cede. Corrigir é trocar a senha, mas a causa é de **rede**: o banco nunca deveria ser alcançável pela internet.

O segundo problema vem depois da correção. A aplicação, ajustada para o novo desenho, passa a falhar com `connect timed out` ao falar com o banco. Quem acessa o banco precisa de um desenho de rede em que **só quem deve chega**, e de um jeito de diagnosticar quando não chega.

## Como funciona

### Subnets privadas

Numa VPC, uma **subnet pública** tem rota para um *internet gateway* e recursos com IP público; uma **subnet privada** não tem rota de entrada da internet, e seus recursos não têm IP público. O desenho comum tem três camadas:

1. subnet pública: balanceador, NAT Gateway e, se necessário, um bastion;
2. subnet privada de aplicação: os serviços, que saem para a internet pelo NAT (aula 8);
3. subnet privada de dados: o banco, **sem rota para fora e sem IP público**.

Nem o IP privado do banco é alcançável de fora da VPC. Um atacante teria de comprometer antes algo dentro da rede.

### Security group: o firewall da instância

O **security group** é um firewall associado ao recurso, e é **stateful**: se uma conexão de entrada é permitida, a resposta é liberada automaticamente, sem regra de saída para ela. A regra do banco é curta:

```text
Entrada: TCP 5432  origem = security group da aplicação (sg-app)
```

Referenciar o **security group** de origem, e não um intervalo de IPs, acompanha as instâncias da aplicação conforme elas sobem e descem. Tudo que não está liberado é negado.

### NACL: o firewall da subnet

A **network ACL** age na subnet e é **stateless**: não lembra de conexões. Uma regra que libera a entrada na porta 5432 **não** libera a resposta; é preciso uma regra de saída para as **portas efêmeras** (1024 a 65535) do cliente (aula 24), em cada sentido. Esquecer isso é um erro clássico: o SYN chega, e o SYN-ACK é descartado na volta. As NACLs também avaliam regras em ordem numérica e permitem regras de negação.

| | Security group | NACL |
|---|---|---|
| Nível | recurso (interface de rede) | subnet |
| Estado | stateful | stateless |
| Regras | só permitir | permitir e negar, por ordem |
| Resposta | liberada automaticamente | precisa de regra nas portas efêmeras |

### Acesso humano

Pessoas precisam de acesso ao banco para diagnóstico, mas não à porta 5432 aberta. As opções:

- **AWS SSM Session Manager:** sessão de terminal ou encaminhamento de porta sem abrir nenhuma porta de entrada, com autenticação IAM e auditoria.
- **Bastion host:** uma instância mínima na subnet pública, com SSH restrito, usada como salto.
- **Túnel SSH:** `ssh -L 5433:db.interno:5432 usuario@bastion` cria uma porta local 5433 que desemboca no banco; o cliente SQL conecta em `localhost:5433`.

### Cifra até o banco

Dentro da VPC o tráfego também deve ir cifrado. No driver JDBC do Postgres, `sslmode=verify-full` exige TLS **e** valida a cadeia do certificado **e** o nome do servidor (aula 19), o que impede um intermediário de se passar pelo banco. `require` cifra, mas não valida quem está do outro lado.

## Na prática

Quando a aplicação não alcança o banco, a **forma da falha** diz onde olhar:

- **`Connection refused`**: o pacote chegou e alguém respondeu RST. A rede está livre; o banco não está escutando naquela porta ou naquele IP.
- **`Connect timed out`**: nada voltou. Um firewall (security group, NACL, rota ausente) está **descartando** em silêncio.

O programa abaixo, completo, classifica as duas situações (e uma terceira, com um endereço de documentação que ninguém responde):

```java
import java.net.*;

public class TestaPorta {
    static String testar(String host, int porta, int timeoutMs) {
        long t0 = System.nanoTime();
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, porta), timeoutMs);
            return "ABERTA (conectou)";
        } catch (ConnectException e) {
            return "RECUSADA: alguém respondeu RST, a porta está fechada (" + e.getMessage() + ")";
        } catch (SocketTimeoutException e) {
            long ms = (System.nanoTime() - t0) / 1_000_000;
            return "TIMEOUT após " + ms + " ms: nada respondeu, típico de firewall ou security group descartando";
        } catch (Exception e) {
            return "OUTRO: " + e;
        }
    }

    public static void main(String[] args) throws Exception {
        try (ServerSocket aberta = new ServerSocket(0, 10, InetAddress.getLoopbackAddress())) {
            int porta = aberta.getLocalPort();
            System.out.println("porta com servidor : " + testar("127.0.0.1", porta, 1000));
        }
        System.out.println("porta sem servidor : " + testar("127.0.0.1", 1, 1000));
        // 192.0.2.1 é endereço de documentação (RFC 5737): não existe, ninguém responde
        System.out.println("destino que descarta: " + testar("192.0.2.1", 5432, 1500));
    }
}
```

A execução imprimiu `ABERTA`, `RECUSADA` e `TIMEOUT após 1501 ms`. O terceiro resultado depende da sua rede (alguns ambientes respondem "network unreachable"), mas é o comportamento típico de um destino filtrado. No Linux, `nc -vz db.interno 5432` mostra a mesma distinção, e `psql "host=db.interno sslmode=verify-full sslrootcert=ca.pem"` testa o caminho completo, com TLS.

Roteiro de diagnóstico quando dá timeout: (1) o security group do banco libera 5432 para o SG da aplicação? (2) o security group de saída da aplicação permite? (3) a NACL libera a ida e a volta nas portas efêmeras? (4) a tabela de rotas das subnets alcança a do banco? (5) o banco escuta no IP correto (`listen_addresses` e `pg_hba.conf`)?

## Armadilhas comuns

- **Banco com IP público "só por enquanto".** Esse enquanto vira definitivo; senhas fracas viram incidente.
- **Origem `0.0.0.0/0` na porta 5432.** Equivale a abrir a porta para qualquer origem que consiga alcançar o banco.
- **NACL sem as portas efêmeras na volta.** O handshake fecha em um sentido só, e o erro parece do banco.
- **Liberar por intervalo de IP em vez de security group.** Quebra quando as instâncias da aplicação trocam de endereço.
- **`sslmode=require` e achar que está validado.** Só `verify-full` confere o certificado e o nome.
- **Confundir timeout com recusa.** São causas diferentes: uma é filtro de rede; a outra, serviço parado ou porta errada.
- **Deixar o banco acessível por senha estática de qualquer lugar.** Prefira autenticação por IAM ou segredos rotacionados.

## Checklist de domínio

- [ ] Você desenha as três camadas: subnet pública, de aplicação e de dados, e o que cada uma pode alcançar
- [ ] Você escreve a regra do banco: TCP 5432 com origem no security group da aplicação
- [ ] Você distingue security group (stateful) de NACL (stateless, com portas efêmeras na volta)
- [ ] Você lista as formas de acesso humano: SSM, bastion e túnel SSH
- [ ] Você usa `sslmode=verify-full` e sabe o que difere de `require`
- [ ] Você diferencia `Connection refused` de `Connect timed out` e segue o roteiro de diagnóstico

## Para ir além

- [AWS: security groups](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html)
- [AWS: network ACLs](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html)
- [PostgreSQL: suporte a SSL e sslmode no JDBC](https://jdbc.postgresql.org/documentation/ssl/)
- [AWS Systems Manager Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
