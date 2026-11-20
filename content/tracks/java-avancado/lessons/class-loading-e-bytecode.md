> **Em uma frase:** antes de executar uma linha de Java, a JVM precisa encontrar o `.class`, verificar que ele é válido, resolver suas referências e só então rodar o inicializador estático — e cada uma dessas etapas tem um erro de produção próprio.

## O problema

O deploy passou no CI, mas a aplicação nova sobe e morre com `NoClassDefFoundError: com/acme/pricing/RateTable`. No diretório `lib/` existem duas versões do mesmo jar. Em outro incidente, um servidor de aplicação sobrevive a três redeploys e depois estoura a metaspace; o heap está pela metade. Os dois casos parecem "problema de classpath", mas acontecem em fases diferentes do class loading.

Sem um modelo mental das fases, você trata sintoma: adiciona jar, limpa cache, reinicia. Com o modelo, você olha o nome binário, o classloader que deveria carregar a classe e o motivo da falha.

## Como funciona

A especificação da JVM divide o ciclo de vida de uma classe em **loading**, **linking** e **initialization**. O loading encontra a representação binária a partir do nome binário (`com.acme.RateTable`) usando um classloader. O linking tem três partes: verificação (o bytecode respeita as regras?), preparação (campos estáticos recebem valores padrão) e resolução (referências simbólicas viram referências diretas, muitas vezes de forma lazy). A inicialização executa o `<clinit>`, que é o bloco `static` mais a atribuição dos campos estáticos.

O carregamento é **parent-first** por padrão: antes de procurar ele mesmo, um classloader delega ao pai. A hierarquia clássica tem bootstrap (módulos da plataforma), platform (módulos do JDK) e application (classpath). Por isso uma classe do seu jar não sobrescreve `java.lang.String`.

```java
public class ClassLoadingDemo {
    static class Base {
        static { System.out.println("init Base"); }
        static int VALUE = 10;
    }

    static class Child extends Base {
        static { System.out.println("init Child"); }
    }

    public static void main(String[] args) {
        ClassLoader app = ClassLoadingDemo.class.getClassLoader();
        System.out.println("application = " + app);
        System.out.println("platform    = " + app.getParent());
        System.out.println("bootstrap   = " + app.getParent().getParent());

        System.out.println("antes de tocar em Base");
        System.out.println(Base.VALUE);
        System.out.println("antes de instanciar Child");
        new Child();
    }
}
```

A saída mostra `init Base` antes de `10` e `init Base`, depois `init Child`, quando `Child` é inicializada. Note que a inicialização de uma classe dispara a da superclasse, mas não a das classes que ela apenas referencia. Um campo `static final int CONSTANTE = 42` compilado como constante também não dispara inicialização: o valor foi inlined no bytecode do chamador.

### O que o bytecode carrega

O `.class` é uma máquina de pilha, não código de máquina. Cada método tem um `Code` com instruções como `aload_0`, `iadd`, `invokevirtual`, `invokedynamic`. O `javap -c -p` traduz isso para algo legível; o `-v` mostra a constant pool e os descritores.

```java
public class BytecodeDemo {
    private int value;

    public int add(int delta) {
        value += delta;
        return value;
    }

    public static void main(String[] args) throws Exception {
        var method = BytecodeDemo.class.getDeclaredMethod("add", int.class);
        System.out.println(method);
        System.out.println("rode: javap -c -p BytecodeDemo.class");
    }
}
```

O bytecode de `add` é curto: `aload_0`, `dup`, `getfield`, `iload_1`, `iadd`, `putfield`, `ireturn`. Lambdas usam `invokedynamic` e um `LambdaMetafactory`; por isso a primeira execução de uma lambda pode custar mais que as seguintes.

## Na prática

Para descobrir de onde uma classe veio, use `java -verbose:class` (mostra a origem de cada classe carregada) ou, em processo vivo, `jcmd <pid> VM.classloader_stats`. Em um fat jar, `jdeps` e a árvore de dependências do Maven revelam duplicatas; dois jars com a mesma classe geram `LinkageError` ou comportamento dependente da ordem.

Há uma diferença importante entre carregar e inicializar. `Class.forName(nome)` inicializa por padrão; `Class.forName(nome, false, loader)` apenas carrega. Já `ClassLoader.loadClass` não inicializa.

```java
public class LoadVsInitialize {
    static class Lazy {
        static { System.out.println("Lazy inicializada"); }
        static final int CONSTANTE = 42;
        static int mutavel = 7;
    }

    public static void main(String[] args) throws Exception {
        Class.forName("LoadVsInitialize$Lazy", false,
                LoadVsInitialize.class.getClassLoader());
        System.out.println("carregada, ainda não inicializada");
        System.out.println(Lazy.mutavel);
    }
}
```

Em containers, um classloader customizado que carrega plugins pode vazar: ele referencia todas as classes que carregou, e cada classe referencia o loader. Se uma thread, `ThreadLocal`, driver JDBC ou shutdown hook mantém o loader vivo após o redeploy, as classes e a metaspace associada nunca são coletadas. O sintoma clássico é `OutOfMemoryError: Metaspace` depois de vários deploys, com heap normal.

## Armadilhas comuns

- **`NoClassDefFoundError` não é `ClassNotFoundException`.** O primeiro costuma indicar que a classe existia na compilação, mas faltou em runtime, ou que a inicialização estática falhou. O segundo é lançado por APIs de carregamento quando o nome não é encontrado.
- **Falha no `<clinit>` vira erro em cascata.** Na primeira tentativa você vê `ExceptionInInitializerError`; nas seguintes, `NoClassDefFoundError: Could not initialize class ...`. A causa raiz está no primeiro log, não no último.
- **Não use `Class.forName` em código de descoberta** se o efeito colateral de inicializar a classe for indesejado. Use `ClassLoader.loadClass` ou passe `initialize=false`.
- **Classloader leak não aparece no heap histogram.** Ele aparece no heap dump como retenção do loader por uma thread ou `ThreadLocal`; procure o caminho de referência, não apenas o tamanho das classes.
- **Ordem de jars importa em classpath, não em module path.** Com módulos, o JPMS falha cedo em conflitos; no classpath, a primeira ocorrência vence silenciosamente.

## Checklist de domínio

- [ ] Você explica loading, linking e initialization sem consultar
- [ ] Você sabe por que `static final` constante não inicializa a classe
- [ ] Você encontra a origem de uma classe com `-verbose:class` ou `jcmd`
- [ ] Você reconhece um classloader leak em um heap dump
- [ ] Você diferencia os três erros de classe mais comuns em produção

## Para ir além

- [JVMS, capítulo 5: Loading, Linking and Initializing](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html)
- [dev.java — A JVM e o ciclo de vida de classes](https://dev.java/learn/jvm/)
- [Baeldung — Class Loaders in Java](https://www.baeldung.com/java-classloaders)
