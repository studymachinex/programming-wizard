> **Em uma frase:** Java não roda o seu código-fonte: ele compila para bytecode e entrega esse contrato portátil a uma JVM que interpreta, verifica e compila o que é quente para código nativo.

## O problema

Você escreve `javac Main.java`, executa `java Main` e funciona. Até o dia em que o build passa na sua máquina e quebra no servidor com `UnsupportedClassVersionError`, ou a aplicação sobe mas morre com `NoClassDefFoundError`, ou o benchmark mostra um método 30% mais rápido que na execução real. Esses três incidentes têm a mesma raiz: alguém tratou "Java" como uma coisa só.

Entender a separação entre compilador, formato de arquivo, máquina virtual e bibliotecas é o que permite diagnosticar esses problemas em minutos em vez de tentar sortes. É também o que explica por que Java continua relevante em sistemas que precisam rodar por uma década.

## Como funciona

O **JDK** é o kit de desenvolvimento: inclui o compilador `javac`, o launcher `java`, o empacotador `jar`, o `javadoc`, o `jshell`, o `jlink` e a JVM. O **JRE** era a distribuição apenas de runtime, com a JVM e as bibliotecas padrão; desde o Java 9 não existe mais um JRE separado oficial, e quem precisa de uma imagem enxuta usa `jlink`. A **JVM** é a máquina virtual que executa bytecode — HotSpot é a implementação de referência, GraalVM é outra.

O fluxo real é este:

1. `javac` valida a sintaxe e gera `.class`, um arquivo binário com bytecode, constant pool e metadados.
2. O classloader carrega a classe, o verificador confere tipos e acesso, e o interpretador começa a executar.
3. O JIT (Just-In-Time) identifica métodos quentes e os compila para código de máquina, com otimizações que um compilador estático não consegue fazer.
4. O garbage collector gerencia a memória; o programador não chama `free`.

```java
// Arquivo: Main.java — compilado com Java 21 gera um .class versão 65
public class Main {
    public static void main(String[] args) {
        var saudacao = "Olá, JVM";
        System.out.println(saudacao + " — argumentos: " + args.length);
        System.out.println("Versão do runtime: " + Runtime.version());
    }
}
```

Compilar e executar é só a ponta:

```java
// Arquivo: Calculadora.java — vira Calculadora.class separadamente
public class Calculadora {
    static int somar(int a, int b) {
        return a + b;
    }
}

// Arquivo: App.java — depende de Calculadora.class no classpath
public class App {
    public static void main(String[] args) {
        System.out.println(Calculadora.somar(2, 3)); // 5
    }
}
```

| Componente | Contém | Quando importa |
|---|---|---|
| JDK | javac, java, jar, JVM, bibliotecas | Compilar e empacotar |
| JVM | Máquina de execução e GC | Executar e ajustar performance |
| Bytecode | Instruções portáteis `.class` | Distribuir o artefato |

O bytecode é o motivo pelo qual o mesmo `.jar` roda em Windows, Linux e macOS. Ele não contém instruções x86 nem chamadas diretas ao sistema operacional; contém operações da JVM, como `invokevirtual`, `aload_0` e `ireturn`. Quem traduz isso para a plataforma é a JVM instalada.

## Na prática

No terminal, o ciclo completo é:

```bash
javac -d out Main.java
java -cp out Main
```

`-d out` separa os `.class` do fonte. Em projetos maiores, quem monta o classpath é o Maven ou o Gradle; na mão, você lista diretórios e JARs separados por `;` no Windows e `:` no Linux. Para inspecionar o que o compilador gerou, `javap -c -p out/Main.class` mostra o bytecode. Você não precisa decorar as instruções, mas reconhecer `invokevirtual` (despacho dinâmico) e `invokedynamic` (usado por lambdas) ajuda a entender custos.

O `javap -verbose` também revela a versão do class file. Java 8 gera 52, Java 11 gera 55, Java 17 gera 61 e Java 21 gera 65. Se o servidor tem Java 17 e o build gerou 65, o erro é imediato: `class file version 65.0, this version of the Java Runtime only recognizes class file versions up to 61.0`.

Uma sutileza de produção: a JVM é otimizada para execução longa. Um método interpretado nas primeiras centenas de chamadas pode ficar mais rápido depois que o C2 o compila. Benchmark sério aquece a JVM, usa JMH e mede depois do warmup. Em uma função serverless de 200 ms, você quase nunca paga o aquecimento completo — e isso muda a escolha de framework.

## Armadilhas comuns

- **Compilar com uma versão e rodar com outra.** Use `--release 21` (ou a versão do servidor) para que o `javac` valide contra a API correta, não apenas contra o class file.
- **Confundir `ClassNotFoundException` com `NoClassDefFoundError`.** O primeiro é o classloader procurando uma classe que não está no classpath; o segundo costuma indicar uma classe que existia na compilação, mas cuja inicialização falhou ou que sumiu do runtime.
- **Apontar `JAVA_HOME` para um JRE antigo.** Ferramentas como Maven usam `JAVA_HOME`, mesmo que seu terminal mostre outra versão no `PATH`. Confira os dois.
- **Concluir performance a partir de uma execução fria.** A primeira chamada mede carregamento de classe, verificação e interpretação, não o custo real do algoritmo.

## Checklist de domínio

- [ ] Você explica a diferença entre JDK, JRE e JVM sem consultar
- [ ] Você descreve o caminho de `.java` até código nativo, incluindo classloader e JIT
- [ ] Você diagnostica um `UnsupportedClassVersionError` olhando a versão do class file
- [ ] Você sabe usar `javap` para confirmar o que foi compilado

## Para ir além

- [dev.java — Learn Java](https://dev.java/learn/): trilha oficial mantida pela Oracle, atualizada para as versões modernas.
- [Java Virtual Machine Specification, Java SE 21](https://docs.oracle.com/javase/specs/jvms/se21/html/index.html): a referência definitiva sobre formato de class file e verificação.
- [HotSpot Virtual Machine Performance Enhancements](https://docs.oracle.com/en/java/javase/21/vm/performance-enhancements.html): como o JIT e o GC se comportam na prática.
