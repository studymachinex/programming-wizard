> **Em uma frase:** serverless e containers não são opostos morais — são modelos de cobrança e operação; escolha pelo padrão de tráfego e pelo custo total.

Lambda cobra por invocação e tempo de execução; containers cobram por recursos reservados enquanto rodam. Para tráfego intermitente, Lambda pode ser ordens de magnitude mais barato. Para carga constante e alta, containers costumam vencer. Cold start e limites de execução decidem o resto.

## O problema

Um webhook recebe 200 eventos por dia, em rajadas. Manter um serviço com duas tasks ECS ligadas 24/7 custa caro e fica ocioso. Já um processamento de vídeo de 40 minutos não cabe no limite de 15 minutos do Lambda. A escolha errada aparece na fatura ou no timeout.

## Como funciona

**Lambda:** evento -> invocação -> execução. Limites: 15 min, 10 GB de memória, 512 MB a 10 GB de `/tmp`, concorrência por conta. Cold start depende de runtime, pacote e VPC. Java tende a ser mais lento para iniciar; SnapStart ajuda em alguns casos.

```java
public class PedidoHandler implements RequestHandler<SQSEvent, Void> {
    private final PedidoService service = Dependencias.service();

    @Override
    public Void handleRequest(SQSEvent event, Context ctx) {
        for (var record : event.getRecords()) {
            service.processar(record.getBody());
        }
        return null;
    }
}
```

Inicialize clientes fora do handler para reutilizar entre invocações. Evite abrir conexão por evento.

**Containers (ECS/EKS/Cloud Run):** processo de longa duração, controle de CPU/memória, scaling por métrica. Permite JVM aquecida, pooling e bibliotecas nativas. Custo inclui orquestração e capacidade ociosa.

## Na prática

Estime: Lambda = invocações × duração × preço + requests. Container = tasks × horas × preço + load balancer. Inclua NAT, logs e transferência.

Para APIs com tráfego constante, containers com autoscaling. Para jobs event-driven e picos, Lambda. Para híbrido, containers para o core e Lambda para bordas.

Otimize cold start: reduza dependências, use runtime Java 21, configure memória adequada (mais memória = mais CPU), evite VPC quando não precisa e use provisioned concurrency apenas para rotas críticas.

## Armadilhas comuns

- Lambda com biblioteca gigante e cold start de 8 s.
- Container superprovisionado 24/7 para tráfego de 1 req/min.
- Ignorar limite de 15 min e timeout silencioso.
- Não configurar DLQ em evento assíncrono.
- Comparar preço de compute sem incluir logs, NAT e orquestração.

## Checklist de domínio

- [ ] Estimo custo de Lambda vs container com números.
- [ ] Conheço limites e cold start do Lambda.
- [ ] Reutilizo clientes entre invocações.
- [ ] Sei configurar concorrência e DLQ.
- [ ] Escolho por padrão de tráfego, não por hype.

## Para ir além

Leia os limites do Lambda e as práticas de otimização de cold start para Java. Depois estime o custo mensal de um cenário real nos dois modelos.
