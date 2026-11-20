> **Em uma frase:** Template Method fixa o esqueleto e deixa buracos; State troca o comportamento inteiro quando o próprio objeto muda de fase. Confundir os dois produz hierarquias rígidas.

Template Method é herança controlada: a classe base define a ordem das etapas e subclasses implementam partes. State é composição: o objeto delega para um estado que pode ser trocado em runtime. Um resolve variação de algoritmo; o outro, variação de ciclo de vida.

## O problema

Um pipeline de importação sempre valida, transforma, persiste e publica. Só a transformação muda por formato. Se cada formato reimplementa o pipeline, a ordem se perde. Já um pedido passa por criado, pago, enviado e cancelado; cada estado aceita operações diferentes. Modelar isso com `if (status == ...)` espalha regras e permite transições inválidas.

## Como funciona

Template Method:

```java
abstract class Importador {
    final void importar(Path arquivo) {
        var linhas = ler(arquivo);
        var dados = transformar(linhas);   // hook
        validar(dados);
        persistir(dados);
        publicar(dados);
    }
    protected abstract List<Linha> transformar(List<String> linhas);
    // ler, validar, persistir e publicar são concretos
}

class ImportadorCsv extends Importador {
    protected List<Linha> transformar(List<String> linhas) {
        return linhas.stream().skip(1).map(Linha::parseCsv).toList();
    }
}
```

O método `final` protege a ordem. Subclasses não podem pular validação.

State:

```java
interface EstadoPedido {
    EstadoPedido pagar(Pedido p);
    EstadoPedido enviar(Pedido p);
}

class AguardandoPagamento implements EstadoPedido {
    public EstadoPedido pagar(Pedido p) { p.registrarPagamento(); return new Pago(); }
    public EstadoPedido enviar(Pedido p) { throw new IllegalStateException("não pago"); }
}
```

O pedido delega e troca a referência de estado. Transições inválidas falham cedo.

## Na prática

Prefira Template Method quando a variação é um passo bem definido e o algoritmo é estável. Prefira Strategy quando a variação precisa ser configurada ou combinada em runtime. Prefira State quando as regras dependem do estado atual e as transições são o coração do domínio.

Ambos podem coexistir: um pipeline com etapas plugáveis (Strategy) e um objeto que muda de fase (State). O erro é usar herança para tudo.

## Armadilhas comuns

- Template Method com muitos hooks: vira uma classe base frágil.
- Subclasse sobrescrevendo método que deveria ser `final`.
- State com transições espalhadas fora dos estados.
- Estado que guarda dados duplicados do contexto.
- `switch` de status convivendo com State: duas fontes de verdade.

## Checklist de domínio

- [ ] Sei diferenciar variação de algoritmo e de estado.
- [ ] Protejo a ordem do template com `final`.
- [ ] Centralizo transições nos estados.
- [ ] Testo transições inválidas.
- [ ] Evito hierarquias profundas.

## Para ir além

Leia Template Method e State em refactoring.guru. Depois refatore um `switch` de status real para State e conte quantos `if` desapareceram.
