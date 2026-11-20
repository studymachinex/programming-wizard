> **Em uma frase:** o Java Memory Model permite que uma thread veja escritas de outra fora de ordem ou nunca; `happens-before` é o contrato que você estabelece para proibir isso, e `volatile` cobre apenas parte dele.

## O problema

Um contador perde 2% dos incrementos em produção e passa nos testes locais. Uma flag `ativo` nunca vira `false` na thread de trabalho, mesmo após `setAtivo(false)`. Um singleton com double-checked locking funciona no notebook e lança `NullPointerException` no servidor.

Nenhum é reproduzível de forma confiável: dependem de timing, núcleo, JIT e cache. O que os une é a ausência de **happens-before** entre escrita e leitura.

## Como funciona

O JMM não promete um espelho único de memória. Cada thread pode manter valores em registradores e caches, e o compilador reordena instruções sem dependência observável. Sem sincronização, uma leitura pode ver valor antigo, novo ou — para `long`/`double` não voláteis — uma escrita parcial. A especificação permite; no HotSpot 64-bit costuma ser atômico, mas não é contrato.

As arestas de happens-before que importam no dia a dia:

- ordem de programa dentro da mesma thread;
- unlock → lock do mesmo monitor;
- escrita `volatile` → leitura `volatile` que enxerga essa escrita;
- `Thread.start()` → tudo que roda na thread iniciada;
- `Thread.join()` → tudo que a thread terminada executou;
- escrita de campo `final` no construtor → leitura da referência, se `this` não escapou;
- transitividade e as garantias das classes de `java.util.concurrent`.

`volatile` entrega visibilidade e ordenação: a escrita funciona como release e a leitura como acquire, impedindo que escritas anteriores desçam e leituras posteriores subam. Não entrega atomicidade. `contador++` continua sendo leitura, soma e escrita, e duas threads podem ler o mesmo valor.

`synchronized` entrega exclusão mútua e as mesmas garantias de memória na entrada e saída do monitor. É reentrante. Sem contenção custa dezenas de nanossegundos; com disputa, o monitor infla e threads estacionam. Biased locking foi removido (JEP 374).

```java
import java.util.concurrent.CountDownLatch;

public class RacyCounter {
    private static int contador;

    public static void main(String[] args) throws Exception {
        CountDownLatch largada = new CountDownLatch(1);
        CountDownLatch fim = new CountDownLatch(4);

        for (int t = 0; t < 4; t++) {
            Thread.ofPlatform().name("worker-" + t).start(() -> {
                try {
                    largada.await(); // maximiza a disputa: todos partem juntos
                    for (int i = 0; i < 100_000; i++) {
                        contador++; // leitura + soma + escrita, não atômico
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    fim.countDown();
                }
            });
        }

        largada.countDown();
        fim.await();
        System.out.println("contador=" + contador + " esperado=400000");
    }
}
```

Rode várias vezes: o resultado fica abaixo de 400000. A correção é sincronizar **todas** as leituras e escritas do invariante no mesmo lock. `volatile int` não resolve; `AtomicInteger` resolve este caso, mas não invariantes com dois campos.

Publicação segura é o outro lado: sem sincronização, um objeto pode ser visto com campos em `0`/`null` mesmo após o construtor. `final` protege os campos finais; `volatile` na referência protege a publicação; imutabilidade resolve os dois. Por isso o DCL exige `volatile`:

```java
public class Configuracao {
    private static final Object LOCK = new Object();
    private static volatile Configuracao instancia; // sem volatile, publicação quebrada

    private final String url;
    private final int timeoutMs;

    private Configuracao() {
        this.url = System.getenv().getOrDefault("API_URL", "https://api.exemplo.com");
        this.timeoutMs = 2_000;
    }

    public static Configuracao get() {
        Configuracao local = instancia;       // leitura volatile (acquire)
        if (local == null) {
            synchronized (LOCK) {
                local = instancia;
                if (local == null) {
                    local = new Configuracao();
                    instancia = local;        // escrita volatile (release)
                }
            }
        }
        return local;
    }

    public String url() { return url; }
    public int timeoutMs() { return timeoutMs; }

    // Alternativa superior: o class loader já garante inicialização única e segura
    private static final class Holder {
        static final Configuracao INSTANCIA = new Configuracao();
    }

    public static Configuracao viaHolder() { return Holder.INSTANCIA; }

    public static void main(String[] args) {
        System.out.println(get().url() + " timeout=" + get().timeoutMs());
        System.out.println(viaHolder().url());
    }
}
```

## Na prática

Prefira imutabilidade: um objeto com todos os campos `final` e sem escape de `this` no construtor é seguro por construção. Quando precisar de estado mutável compartilhado, escolha o mecanismo pelo invariante — lock para múltiplos campos, atômico para uma variável, `volatile` para uma flag publicada.

O escopo do lock é onde mais se erra. `synchronized` em método de instância trava o objeto; dois objetos diferentes têm dois locks. `synchronized` em método estático trava o `Class`. E o lock precisa ser o mesmo na leitura e na escrita: sincronizar só o `set` deixa o `get` ler um estado intermediário.

Nunca use como lock um objeto que você não controla: `this`, `String` literal, `Integer.valueOf(1)` ou uma `Class` pública. Outro código pode sincronizar no mesmo objeto e criar contenção ou deadlock. Use `private static final Object LOCK = new Object()`.

Para medir, JFR registra `jdk.JavaMonitorEnter` acima de um limiar (20 ms por padrão) e `jdk.JavaMonitorWait`; `jcmd <pid> Thread.print` mostra quem está `BLOCKED` e em qual monitor. Para provar ausência de race, teste de stress não basta: use o JCStress, que explora interleavings.

## Armadilhas comuns

- **Usar `volatile` em contador.** Visibilidade não é atomicidade; `x++` continua perdendo atualizações.
- **DCL sem `volatile`.** A referência pode ser publicada antes dos campos; a segunda thread vê um objeto meio construído.
- **Sincronizar em `this` ou em literal.** O lock vaza para fora da classe e vira ponto de contenção imprevisível.
- **Proteger a escrita e não a leitura.** O invariante só existe se todas as partes usarem o mesmo monitor.
- **Deixar `this` escapar no construtor.** Registrar listener, iniciar thread ou publicar em campo estático antes do fim quebra a garantia de `final`.

## Checklist de domínio

- [ ] Você lista as arestas de happens-before sem consultar
- [ ] Você explica por que `volatile` não torna `x++` atômico
- [ ] Você escreve um DCL correto e conhece a alternativa com holder
- [ ] Você identifica publicação insegura e escape de `this`
- [ ] Você escolhe entre lock, atômico e imutabilidade pelo invariante

## Para ir além

- [JLS, capítulo 17 — Threads and Locks](https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html)
- [JEP 374 — Deprecate and Disable Biased Locking](https://openjdk.org/jeps/374)
- [Jenkov — Java Volatile Keyword](https://jenkov.com/tutorials/java-concurrency/volatile.html)
