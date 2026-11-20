> **Em uma frase:** Um ambiente Java confiável é aquele em que você sabe exatamente qual JDK compila, qual JVM executa e qual diretório entra no classpath — e consegue repetir isso fora da IDE.

## O problema

Quem começa instala três JDKs sem perceber: o do sistema, o que o IntelliJ baixou e o que o Gradle trouxe. O projeto compila na IDE, mas o `java -jar` no terminal falha. Ou o contrário: funciona no terminal e a IDE mostra dezenas de erros vermelhos porque aponta para outro SDK.

O primeiro programa não serve para aprender `System.out.println`. Serve para provar que você controla a cadeia inteira: arquivo, compilador, classpath, classe com `main`, execução e leitura de erro. Se essa cadeia está clara, qualquer build posterior é variação dela.

## Como funciona

Instale um JDK 21 LTS (Temurin, Oracle ou Microsoft Build of OpenJDK). Confirme com:

```bash
java -version
javac -version
echo $JAVA_HOME   # PowerShell: $env:JAVA_HOME
```

As duas versões devem coincidir. No Windows, o instalador costuma adicionar `java.exe` ao `PATH`, mas não define `JAVA_HOME`; Maven, Gradle e alguns scripts dependem dessa variável. Aponte-a para a raiz do JDK, não para a pasta `bin`.

No IntelliJ, crie um projeto Java e escolha o SDK 21 em **Project Structure > Project**. O campo *Language level* deve ser 21. Em projetos Maven/Gradle, a versão também aparece no `pom.xml` ou no `build.gradle`; a IDE costuma sincronizar, mas nem sempre.

Um programa mínimo:

```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Primeiro programa Java");
        System.out.println("JDK em uso: " + System.getProperty("java.version"));
    }
}
```

Cada palavra da assinatura tem função. `public` permite que a JVM acesse o método; `static` faz com que ele exista sem instância; `void` indica que não há retorno; `main` é o nome procurado pelo launcher; e `String[] args` recebe os argumentos da linha de comando. O arquivo precisa se chamar `Main.java` porque a classe é pública.

Argumentos chegam como texto, sempre:

```java
public class SomaArgs {
    public static void main(String[] args) {
        if (args.length != 2) {
            System.err.println("Uso: java SomaArgs <a> <b>");
            System.exit(2); // código diferente de zero sinaliza falha
        }
        int a = Integer.parseInt(args[0]);
        int b = Integer.parseInt(args[1]);
        System.out.printf("Soma: %d%n", a + b);
    }
}
```

`java SomaArgs 7 5` imprime `Soma: 12`. `java SomaArgs 7` imprime a mensagem de uso e retorna 2. Essa distinção entre saída padrão, saída de erro e código de saída é o que permite que scripts e pipelines detectem falhas.

## Na prática

No terminal, dentro da pasta do arquivo:

```bash
javac Main.java
java Main
```

O `javac` cria `Main.class` ao lado do fonte. O `java` recebe o nome da classe, não o nome do arquivo. Se você declarar `package br.com.exemplo;`, o comando passa a ser `java br.com.exemplo.Main` e a classe precisa estar em `br/com/exemplo/Main.class`. Esse é o erro de classpath mais comum de quem está começando.

A IDE automatiza, mas esconde decisões. Antes de confiar nela, rode o projeto pelo terminal pelo menos uma vez. No IntelliJ, o botão Run usa o SDK do projeto; se o código compilar mas o console mostrar uma versão diferente, verifique **Run > Edit Configurations > JRE**.

Quando algo falha, leia o stack trace de baixo para cima. A primeira linha traz o tipo da exceção e a mensagem; as linhas seguintes mostram a pilha. A linha `at Main.main(Main.java:7)` indica que a falha ocorreu na linha 7 do seu arquivo. Um `NumberFormatException: For input string: "7.5"` não é mistério: `Integer.parseInt` não aceita decimal.

## Armadilhas comuns

- **Salvar como `main.java`.** Em sistemas de arquivos case-sensitive, o compilador não encontra a classe pública. O nome deve ser idêntico, incluindo maiúsculas.
- **Classe dentro de pacote executada pelo nome curto.** `java Main` não encontra `br.com.exemplo.Main`. Use o nome totalmente qualificado.
- **Codificação diferente entre terminal e IDE.** No Windows, o console pode usar cp1252 enquanto o arquivo está em UTF-8; acentos viram caracteres estranhos. Configure `-Dfile.encoding=UTF-8` e salve os fontes em UTF-8.
- **Misturar JDK do projeto com JDK de execução.** O IntelliJ mostra a versão no canto inferior; confira antes de culpar o código.

## Checklist de domínio

- [ ] Você instala um JDK 21 e confirma `java` e `javac` na mesma versão
- [ ] Você compila e executa um arquivo pelo terminal, sem IDE
- [ ] Você cria um projeto no IntelliJ apontando para o SDK correto
- [ ] Você lê um stack trace e localiza a linha exata da falha

## Para ir além

- [dev.java — Getting Started](https://dev.java/learn/getting-started/): instalação e primeiros passos na documentação oficial.
- [IntelliJ IDEA — Java project setup](https://www.jetbrains.com/help/idea/getting-started-with-java.html): configuração de SDK, run configurations e estrutura de projeto.
- [Java SE 21 API — System](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/System.html): propriedades do sistema e códigos de saída.
