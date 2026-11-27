> **Em uma frase:** o certificado liga uma chave pública a um nome e é validado pela cadeia folha, intermediária e raiz até uma CA que o cliente já conhece; o SNI, enviado em claro no `ClientHello`, deixa um único IP servir muitos domínios HTTPS, e a maioria dos incidentes vem de cadeia incompleta, certificado vencido ou truststore sem a CA.

## O problema

Três incidentes parecidos, três causas diferentes:

1. Um serviço Java chama a API de um parceiro e falha com `SSLHandshakeException: PKIX path building failed`, enquanto o mesmo endereço funciona no navegador. A equipe do parceiro jura que "o certificado está válido".
2. Numa sexta-feira à noite, todos os clientes recusam a conexão de uma só vez: o certificado venceu e ninguém tinha alarme.
3. Um cliente customizado chega a um servidor com muitos domínios e recebe o certificado **errado**, com o nome de outro site.

Os três se resolvem entendendo o que o servidor envia, o que o cliente confere e como o servidor sabe qual certificado apresentar.

## Como funciona

### Certificado e cadeia de confiança

Um certificado X.509 contém uma **chave pública**, os **nomes** para os quais vale (campo *Subject Alternative Name*, SAN), o **período de validade** e a **assinatura** de quem o emitiu. A confiança é transitiva:

- A **folha** é o certificado do site (`loja.com.br`), assinada por uma **CA intermediária**.
- A intermediária é assinada por uma **CA raiz**.
- As **raízes** ficam no **truststore** do cliente (sistema, navegador, `cacerts` da JVM). A confiança vem delas.

O servidor envia a **folha e as intermediárias**; a raiz não precisa ser enviada (o cliente a tem). Raízes ficam offline e intermediárias fazem o trabalho do dia a dia, o que limita o dano de um vazamento.

### O que o cliente valida

1. **Assinaturas:** cada certificado é assinado pelo seguinte, até uma raiz confiável.
2. **Validade:** `notBefore` ≤ agora ≤ `notAfter`, em todos os elos. (Relógio errado em um cliente quebra a validação.)
3. **Nome:** o domínio acessado precisa estar no **SAN** da folha. O `CN` é ignorado pelos clientes modernos. `*.exemplo.org` cobre `blog.exemplo.org`, mas não `exemplo.org` nem `a.b.exemplo.org`.
4. **Revogação:** por OCSP (de preferência *stapled*, enviado pelo próprio servidor) ou CRL, quando aplicável.
5. **Uso da chave:** o certificado precisa permitir autenticação de servidor.

### SNI: um IP, muitos domínios

O handshake TLS acontece **antes** do HTTP, então o cabeçalho `Host` ainda não chegou e o servidor só vê **IP e porta**. Como escolher o certificado? A extensão **SNI** (*Server Name Indication*) coloca o nome do domínio no `ClientHello`: o servidor lê `loja.com.br`, escolhe o certificado correspondente e segue. Sem SNI, devolve o certificado **padrão**, em geral de outro domínio.

O SNI vai **em claro**, antes de existir qualquer chave. Quem observa a rede vê **qual domínio** você acessa (não o caminho nem o conteúdo). Firewalls corporativos o usam para filtrar sites. A evolução é o **ECH** (*Encrypted Client Hello*), que cifra o `ClientHello` com uma chave publicada no DNS, mas depende de suporte em cliente, CDN e servidor.

### A falha mais comum: intermediária ausente

Se o servidor envia só a folha, navegadores muitas vezes funcionam (têm intermediárias em cache ou as baixam pelo campo AIA), mas **Java, curl e clientes de API falham**: o cliente tem a raiz e a folha, e não o elo do meio. A correção é servir o **bundle completo** (folha + intermediárias) no servidor, e não depende de quem chama.

## Na prática

O programa abaixo conecta (com SNI automático, pois usa o `SSLSocketFactory` padrão com o nome do host), valida pelo truststore da JVM e imprime a **cadeia** que o servidor enviou:

```java
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

public class Cadeia {
    public static void main(String[] args) throws Exception {
        String host = args.length > 0 ? args[0] : "example.com";
        try (SSLSocket s = (SSLSocket) SSLSocketFactory.getDefault().createSocket(host, 443)) {
            s.startHandshake();                                   // valida a cadeia com o truststore (cacerts) e o hostname
            Certificate[] cadeia = s.getSession().getPeerCertificates();
            for (int i = 0; i < cadeia.length; i++) {
                X509Certificate c = (X509Certificate) cadeia[i];
                System.out.println(i + ": " + c.getSubjectX500Principal().getName());
                System.out.println("   emitido por " + c.getIssuerX500Principal().getName());
                System.out.println("   válido até " + c.getNotAfter().toInstant());
                if (i == 0 && c.getSubjectAlternativeNames() != null) System.out.println("   SANs: " + c.getSubjectAlternativeNames());
            }
        }
    }
}
```

Uma execução imprimiu a folha `CN=example.com` (com SANs `example.com` e `*.example.com`), emitida por uma intermediária, que por sua vez foi emitida por outra intermediária, até uma raiz. O número de elos varia por site e muda quando a CA renova a sua cadeia. Note que `getPeerCertificates()` devolve **o que o servidor enviou** (e a validação já passou pelo `cacerts`).

Para quem escreve clientes, três regras práticas:

- **Não desligue a validação.** Um `TrustManager` que aceita tudo ou um `HostnameVerifier` que devolve `true` deixam o canal criptografado, mas **sem autenticação**: qualquer um pode se passar pelo servidor.
- **CA interna:** importe a raiz no truststore (`keytool -importcert -alias ca-interna -file raiz.pem -keystore truststore.p12`) e aponte a JVM com `-Djavax.net.ssl.trustStore=...` (ou crie um `SSLContext` próprio). O `cacerts` fica em `$JAVA_HOME/lib/security`; `keytool -list -cacerts` o lista.
- **mTLS (autenticação mútua):** o cliente também apresenta um certificado, a partir de um *keystore* (`-Djavax.net.ssl.keyStore=...`). É o padrão entre serviços em malhas como Istio.

Para diagnosticar do terminal:

```bash
openssl s_client -connect loja.com.br:443 -servername loja.com.br
openssl x509 -in folha.pem -noout -subject -issuer -dates -ext subjectAltName
openssl s_client -connect loja.com.br:443 -servername loja.com.br </dev/null | openssl x509 -noout -enddate
```

O primeiro mostra o que o servidor envia e se a cadeia fecha; o segundo, nome, emissor, datas e SANs de um certificado salvo; o terceiro, só a data de expiração, ideal para alarmes.

O `-servername` é o SNI: sem ele, o `openssl` mostra o certificado **padrão** do servidor. E `verify error:num=20:unable to get local issuer certificate` confirma a intermediária ausente.

## Armadilhas comuns

- **Testar só no navegador.** Ele esconde a intermediária ausente. Valide com `openssl s_client` e com o seu cliente Java.
- **Deixar o certificado vencer.** Os certificados públicos têm validade cada vez menor (os do Let's Encrypt duram 90 dias). Automatize com ACME e monitore o `notAfter` com alarme de pelo menos 14 dias.
- **Confiar no `CN`.** Só o SAN vale. Um certificado sem o nome no SAN falha em clientes modernos mesmo com `CN` correto.
- **Curinga pensado como recursivo.** `*.exemplo.org` não cobre `a.b.exemplo.org` nem o apex `exemplo.org`.
- **Desligar a verificação para "fazer funcionar".** É o atalho que vira vulnerabilidade permanente. Corrija a cadeia ou o truststore.
- **Esquecer o SNI em clientes de baixo nível.** Sem `SNIHostName`, `SSLSocket` criado por IP não envia o nome, e o servidor devolve o certificado padrão.
- **Assumir que TLS esconde o domínio.** O SNI e o DNS comum revelam o destino. Para privacidade de domínio, é preciso ECH e DNS cifrado.

## Checklist de domínio

- [ ] Você explica a cadeia folha, intermediária e raiz e o papel do truststore
- [ ] Você lista o que o cliente valida: assinaturas, validade, SAN e revogação
- [ ] Você explica por que o servidor precisa do SNI e o que ele revela a quem observa a rede
- [ ] Você diagnostica uma intermediária ausente e sabe corrigi-la no servidor
- [ ] Você configura o truststore da JVM para uma CA interna sem desligar a verificação
- [ ] Você monitora a expiração de certificados e automatiza a renovação

## Para ir além

- [RFC 5280: Internet X.509 Public Key Infrastructure Certificate and CRL Profile](https://www.rfc-editor.org/rfc/rfc5280)
- [RFC 6066: TLS Extensions (inclui o SNI)](https://www.rfc-editor.org/rfc/rfc6066)
- [RFC 6125: Verificação de identidade de serviço em certificados](https://www.rfc-editor.org/rfc/rfc6125)
- [RFC 8555: Automatic Certificate Management Environment (ACME)](https://www.rfc-editor.org/rfc/rfc8555)
- [Let's Encrypt: como funciona](https://letsencrypt.org/how-it-works/)
