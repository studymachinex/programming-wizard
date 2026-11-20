> **Em uma frase:** singleton resolve "uma instância por JVM" ao custo de estado global; Prototype resolve "criar uma variação de um objeto caro" ao custo de copiar estado com cuidado.

## O problema

O singleton é apresentado como a solução para configuração, conexão e logging. O código chama `Configuracao.getInstance()` em qualquer lugar e funciona. Depois, um teste define a taxa de imposto como 0,1. Outro teste espera 0,2 e falha dependendo da ordem de execução. Em produção, um job altera a configuração global e afeta requests concorrentes. Ninguém sabe quem mudou o valor porque a dependência não aparece em nenhum construtor.

O Prototype tem o problema oposto. Criar um contrato a partir de um modelo é caro: são dezenas de cláusulas, validações e objetos aninhados. O time tenta `clone()` e descobre que a cópia é rasa: os dois contratos compartilham a mesma lista de cláusulas. Alterar a cópia altera o original, e o bug aparece semanas depois, em um documento jurídico.

## Como funciona

**Singleton** garante uma única instância e fornece um ponto de acesso global. Há várias implementações:

- `getInstance()` com inicialização preguiçosa e `synchronized` — correto, mas custa lock em todo acesso;
- holder idiom com classe interna estática — lazy e thread-safe sem lock explícito;
- `enum` com uma constante — resistente a serialização e reflexão, mas eager e sem herança.

O problema raramente é a unicidade. É o **acesso global a estado mutável**. Quem chama `getInstance()` não declara a dependência, então o teste precisa conhecer e limpar o estado global. Em uma JVM com múltiplos classloaders — comum em servidores de aplicação e plugins — pode haver mais de uma instância. E, em um cluster, "singleton" significa uma por JVM, não uma no sistema.

```java
import java.util.HashMap;
import java.util.Map;

public final class Configuracao {
    private static final Configuracao INSTANCIA = new Configuracao();
    private final Map<String, String> valores = new HashMap<>();

    private Configuracao() {}

    public static Configuracao getInstance() { return INSTANCIA; }

    public String get(String chave) { return valores.get(chave); }
    public void set(String chave, String valor) { valores.put(chave, valor); }
}
```

Esse objeto é um `HashMap` global sem contrato de concorrência. Duas threads podem escrever ao mesmo tempo; um teste pode vazar valor para o próximo. Se amanhã a configuração vier de um servidor remoto, todo chamador precisa mudar.

A alternativa é injetar uma configuração imutável, construída uma vez na borda:

```java
import java.util.Map;

record Configuracoes(Map<String, String> valores) {
    Configuracoes {
        valores = Map.copyOf(valores);
    }

    String obter(String chave) {
        String valor = valores.get(chave);
        if (valor == null) throw new IllegalArgumentException("configuração ausente: " + chave);
        return valor;
    }
}

class CalculadoraImposto {
    private final Configuracoes config;

    CalculadoraImposto(Configuracoes config) {
        this.config = config;
    }

    double calcular(double base) {
        return base * Double.parseDouble(config.obter("taxa.imposto"));
    }
}
```

Agora cada teste passa sua própria configuração. Não há estado compartilhado, não há ordem de execução, e a dependência está no construtor. Se a configuração precisar ser recarregada, você troca a instância injetada ou usa um `Supplier<Configuracoes>` com cache — sem transformar o objeto em variável global.

Ainda existem usos defensáveis para singleton: um registro de métricas append-only, um pool de recursos realmente único do processo, um cache imutável carregado na inicialização. Nesses casos, prefira `enum` ou holder e mantenha o estado thread-safe:

```java
import java.util.concurrent.atomic.AtomicLong;

public enum Metricas {
    INSTANCIA;

    private final AtomicLong pedidos = new AtomicLong();

    public void pedidoCriado() { pedidos.incrementAndGet(); }
    public long totalPedidos() { return pedidos.get(); }
}
```

O `enum` resolve os problemas de serialização e reflexão do singleton clássico, mas não resolve o acoplamento: quem chama `Metricas.INSTANCIA` continua dependendo de um global. Em código testável, injete uma interface `RegistroMetricas` e use o enum apenas como implementação de borda.

**Prototype** é sobre clonar um objeto existente para criar variantes. Em vez de reconstruir um contrato do zero, você copia o modelo e adiciona a cláusula específica. O ponto crítico é a profundidade da cópia.

```java
import java.util.ArrayList;
import java.util.List;

record Clausula(String texto) {}

final class Contrato {
    private final String cliente;
    private final List<Clausula> clausulas;

    Contrato(String cliente, List<Clausula> clausulas) {
        this.cliente = cliente;
        this.clausulas = new ArrayList<>(clausulas);
    }

    // Construtor de cópia: o Prototype do mundo Java.
    Contrato(Contrato outro) {
        this(outro.cliente, outro.clausulas);
    }

    Contrato comClausula(Clausula nova) {
        var copia = new ArrayList<>(clausulas);
        copia.add(nova);
        return new Contrato(cliente, copia);
    }

    String cliente() { return cliente; }
    List<Clausula> clausulas() { return List.copyOf(clausulas); }
}
```

`Clausula` é um record imutável, então copiar a lista é suficiente. Se cada cláusula tivesse um objeto mutável interno, a cópia precisaria replicar esses objetos também — cópia profunda. Caso contrário, original e cópia compartilhariam estado.

Um registro de protótipos pode evitar condicionais:

```java
import java.util.Map;
import java.util.function.Supplier;

Map<String, Supplier<Contrato>> modelos = Map.of(
        "padrao", () -> new Contrato("", List.of(new Clausula("Pagamento em 30 dias"))),
        "enterprise", () -> new Contrato("", List.of(
                new Clausula("SLA de 99,9%"),
                new Clausula("Suporte 24x7")))
);
```

O cliente escolhe o modelo e chama `get()`. Cada chamada produz uma cópia independente; o modelo não é mutado.

## Na prática

Singleton e Prototype costumam aparecer juntos em configurações de framework, mas a decisão de design é diferente. Pergunte: "preciso de uma instância única porque o recurso é único, ou porque é conveniente acessar de qualquer lugar?". Se for conveniência, injeção resolve. Pergunte também: "a cópia precisa ser independente em que nível?". Se houver listas, mapas ou objetos mutáveis aninhados, cópia rasa é bug esperando data.

`Cloneable` no Java é uma armadilha histórica: `Object.clone()` é protegido, a interface não declara o método e a cópia é rasa por padrão. Prefira construtor de cópia ou um método `copiar()` explícito. O código fica mais claro e não depende de reflexão nem de exceções verificadas.

E quando **não** usar? Evite singleton para configuração, repositórios, serviços e qualquer coisa com estado de request. Evite Prototype quando o objeto é barato de criar ou quando a cópia profunda é mais complexa que a construção. Em ambos os casos, o padrão pode esconder um problema de modelagem: talvez o objeto devesse ser passado explicitamente, ou o modelo devesse ser um dado imutável.

## Armadilhas comuns

- **Singleton com estado mutável e sem sincronização.** `HashMap` global não é thread-safe. Use estruturas concorrentes e, de preferência, não compartilhe estado mutável.
- **Achar que singleton é único no cluster.** Cada JVM tem a sua instância. Para exclusão mútua entre processos, use banco, lock distribuído ou fila.
- **Cópia rasa disfarçada de Prototype.** Listas e mapas internos precisam ser copiados. Teste alterando a cópia e verificando o original.
- **`clone()` sem contrato.** A cópia rasa padrão e a ausência de `Cloneable` no método confundem. Prefira construtor de cópia.

## Checklist de domínio

- [ ] Você diferencia instância única de acesso global
- [ ] Você implementa singleton thread-safe e sabe seus limites em cluster
- [ ] Você decide entre cópia rasa e profunda com base nos objetos internos
- [ ] Você reconhece quando injeção ou um modelo imutável substitui o padrão

## Para ir além

- [Singleton](https://refactoring.guru/design-patterns/singleton) — variantes, críticas e relação com estado global.
- [Prototype](https://refactoring.guru/design-patterns/prototype) — cópia, registros de protótipos e armadilhas.
- [Singleton em Java](https://www.baeldung.com/java-singleton) — holder, enum, serialização e reflexão.
