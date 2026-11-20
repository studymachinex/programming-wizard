> **Em uma frase:** Factory Method varia um produto; Abstract Factory garante que uma família inteira de produtos nasça compatível.

## O problema

O serviço de comunicação começa com e-mail. Depois entra SMS, depois push, depois WhatsApp. A primeira implementação espalha `new EmailNotificacao()` pelo código. A segunda adiciona `if (canal.equals("sms")) new SmsNotificacao()` em três lugares. A terceira exige mudar a assinatura de um método que recebia `String canal` para receber um enum, e agora todo mundo precisa saber qual classe instanciar.

O sintoma é sempre o mesmo: a decisão de **qual objeto criar** está misturada com a decisão de **o que fazer com ele**. Criar é uma responsabilidade; usar é outra. Padrões criacionais separam essas duas coisas — mas cobram um preço em classes e indireção que precisa ser justificado.

## Como funciona

**Factory Method** define uma interface para criar um objeto, mas deixa subclasses ou implementações decidirem qual classe concreta instanciar. O cliente depende do produto abstrato. No formato GoF clássico, o criador também tem um método de negócio que usa o produto; a subclasse só fornece a fábrica.

```java
interface Notificacao {
    void enviar(String destino, String mensagem);
}

class EmailNotificacao implements Notificacao {
    public void enviar(String destino, String mensagem) {
        System.out.println("EMAIL para " + destino + ": " + mensagem);
    }
}

class SmsNotificacao implements Notificacao {
    public void enviar(String destino, String mensagem) {
        System.out.println("SMS para " + destino + ": " + mensagem);
    }
}

abstract class CriadorNotificacao {
    protected abstract Notificacao criar();

    // O fluxo de negócio é fixo; só a criação varia.
    public void avisar(String destino, String mensagem) {
        Notificacao notificacao = criar();
        notificacao.enviar(destino, mensagem);
    }
}

class CriadorEmail extends CriadorNotificacao {
    protected Notificacao criar() { return new EmailNotificacao(); }
}

class CriadorSms extends CriadorNotificacao {
    protected Notificacao criar() { return new SmsNotificacao(); }
}
```

O cliente chama `new CriadorSms().avisar(...)` e não conhece `SmsNotificacao`. Se amanhã o SMS ganhar fallback para WhatsApp, a mudança fica no criador ou no produto, não no fluxo que dispara a mensagem.

**Abstract Factory** entra quando existe mais de um produto e eles precisam ser da mesma família. Exemplo: armazenamento e fila do mesmo provedor de nuvem. Misturar S3 da AWS com Pub/Sub do GCP pode até funcionar em laboratório, mas quebra permissões, latência e custo de egress. A fábrica abstrata torna essa combinação impossível de montar por acidente.

```java
interface Armazenamento {
    void put(String chave, byte[] dados);
}

interface Fila {
    void publicar(String topico, String payload);
}

interface FabricaCloud {
    Armazenamento armazenamento();
    Fila fila();
}

class ArmazenamentoAws implements Armazenamento {
    public void put(String chave, byte[] dados) {
        System.out.println("S3.put " + chave + " (" + dados.length + " bytes)");
    }
}

class FilaAws implements Fila {
    public void publicar(String topico, String payload) {
        System.out.println("SQS.publish " + topico + " " + payload);
    }
}

class FabricaAws implements FabricaCloud {
    public Armazenamento armazenamento() { return new ArmazenamentoAws(); }
    public Fila fila() { return new FilaAws(); }
}

class ArmazenamentoGcp implements Armazenamento {
    public void put(String chave, byte[] dados) {
        System.out.println("GCS.put " + chave + " (" + dados.length + " bytes)");
    }
}

class FilaGcp implements Fila {
    public void publicar(String topico, String payload) {
        System.out.println("PubSub.publish " + topico + " " + payload);
    }
}

class FabricaGcp implements FabricaCloud {
    public Armazenamento armazenamento() { return new ArmazenamentoGcp(); }
    public Fila fila() { return new FilaGcp(); }
}

class Exportador {
    private final FabricaCloud cloud;

    Exportador(FabricaCloud cloud) {
        this.cloud = cloud;
    }

    void exportar(String id, byte[] dados) {
        // Os dois produtos vêm da mesma família por construção.
        cloud.armazenamento().put(id, dados);
        cloud.fila().publicar("exportacoes", id);
    }
}
```

A composição escolhe a família uma vez:

```java
FabricaCloud fabrica = Boolean.getBoolean("cloud.gcp") ? new FabricaGcp() : new FabricaAws();
var exportador = new Exportador(fabrica);
```

## Na prática

Factory Method é útil quando a criação tem uma regra própria — escolher implementação por configuração, aplicar cache, validar parâmetros, retornar um fake em teste. Abstract Factory é útil quando **a consistência entre produtos** é uma regra de negócio. Se você não tem famílias, não tem Abstract Factory; tem apenas duas fábricas fazendo trabalho que o `new` faria.

No Quarkus, é comum não precisar de Abstract Factory explícita: você declara beans de uma família com `@Produces` ou `@Alternative` e injeta as interfaces. O container vira a fábrica. Ainda assim, a garantia de consistência não é automática. Se `Armazenamento` e `Fila` forem beans independentes, um perfil mal configurado pode injetar S3 com Pub/Sub. Uma fábrica única, ou um bean que agrupa os dois, torna o erro impossível de configurar.

Há também alternativas mais simples. Para variação por string, um `Map<String, Supplier<Notificacao>>` imutável resolve sem hierarquia de criadores:

```java
Map<String, Supplier<Notificacao>> fabricas = Map.of(
        "email", EmailNotificacao::new,
        "sms", SmsNotificacao::new
);
Notificacao notificacao = fabricas.get(canal).get();
```

Isso é uma fábrica simples, não GoF, e muitas vezes é o suficiente. O critério é o mesmo de sempre: quantas variações reais existem, com que frequência elas mudam e quanto custa a indireção.

E quando **não** usar? Quando existe uma única implementação estável, quando o objeto é trivial e quando a fábrica apenas repassa argumentos para o construtor. Nesses casos, `new` é mais legível e o compilador continua ajudando. Fábrica não é sinônimo de baixo acoplamento; é uma forma de mover a decisão de criação para um ponto controlado. Se a decisão não existe, a fábrica é cerimônia.

## Armadilhas comuns

- **Fábrica que retorna `null`.** Um canal desconhecido deve falhar na hora, com mensagem clara. `null` empurra o erro para o cliente e produz `NullPointerException` longe da causa.
- **Fábrica que esconde dependências.** Um método estático `criar()` que lê variável de ambiente, abre conexão e escolhe implementação é difícil de testar. Prefira injetar a configuração.
- **Abstract Factory com uma família só.** Se só existe AWS, a fábrica abstrata adiciona cinco tipos sem variação. Espere a segunda família real.
- **Confundir Factory Method com Simple Factory.** Uma classe com `switch` que retorna produtos é uma fábrica simples; não há polimorfismo no criador. O nome importa menos que a consequência: quem precisa mudar quando entra um produto novo?

## Checklist de domínio

- [ ] Você explica quando a criação deve ser separada do uso
- [ ] Você implementa Factory Method com um criador que também tem comportamento
- [ ] Você reconhece o problema de consistência entre famílias
- [ ] Você sabe dizer quando `new` ou um `Map` de suppliers é melhor

## Para ir além

- [Factory Method](https://refactoring.guru/design-patterns/factory-method) — estrutura, variantes e exemplos.
- [Abstract Factory](https://refactoring.guru/design-patterns/abstract-factory) — famílias de produtos e o custo da abstração.
- [Factory Pattern em Java](https://www.baeldung.com/java-factory-pattern) — implementação e comparação com o padrão clássico.
