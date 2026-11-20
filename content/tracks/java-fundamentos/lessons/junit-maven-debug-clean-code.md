> **Em uma frase:** teste não é burocracia — é o mecanismo que permite refatorar sem medo e provar que o comportamento continua correto.

Todo projeto Java começa simples e termina com dezenas de classes, configurações e dependências. Sem um ciclo de feedback curto, cada mudança vira aposta: você compila, sobe a aplicação inteira, clica no fluxo e torce. JUnit, Maven e um depurador bem usado transformam essa aposta em engenharia.

## O problema

Considere uma regra de desconto com três faixas e um caso especial para clientes novos. Testar manualmente todas as combinações leva minutos; automatizar leva segundos e roda em todo commit. O custo de não testar não é escrever o teste — é descobrir a regressão em produção, quando o contexto já se perdeu.

## Como funciona

O ciclo é sempre o mesmo:

1. **Arrange:** monte o estado e as dependências.
2. **Act:** execute uma única ação.
3. **Assert:** verifique o resultado observável.

JUnit 5 organiza isso com `@Test`, `@ParameterizedTest`, `@BeforeEach` e assertions de `org.junit.jupiter.api.Assertions`. O Maven executa os testes na fase `test` do ciclo de vida, via Surefire. Um comando `mvn test` compila, descobre e roda tudo.

```java
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.*;

class DescontoTest {
    private Desconto desconto;

    @BeforeEach
    void setUp() {
        desconto = new Desconto();
    }

    @ParameterizedTest
    @CsvSource({
        "100.00, 0.00",
        "500.00, 25.00",
        "1000.00, 100.00",
        "0.00, 0.00"
    })
    void aplicaFaixasDeDesconto(double valor, double esperado) {
        assertEquals(esperado, desconto.calcular(valor), 0.001);
    }

    @Test
    void rejeitaValorNegativoComMensagemUtil() {
        var erro = assertThrows(IllegalArgumentException.class,
            () -> desconto.calcular(-1));
        assertTrue(erro.getMessage().contains("negativo"));
    }
}
```

Testes parametrizados eliminam cópia e deixam a tabela de casos visível. Para exceções, `assertThrows` verifica tipo e mensagem. Para estados complexos, prefira objetos reais pequenos a mocks desnecessários.

## Na prática

No Maven, mantenha versões no `pom.xml` e rode `mvn test` antes de cada commit. Se um teste falha, o surefire gera relatórios em `target/surefire-reports`; leia a stack trace de baixo para cima e reproduza em um teste isolado.

Debug não é `System.out.println` espalhado. Use breakpoints condicionais, *watch expressions* e *step into* para entender o fluxo. Para problemas de concorrência, logs estruturados com thread e timestamp valem mais que dezenas de prints. No IntelliJ, `Evaluate Expression` permite testar hipóteses sem recompilar.

Clean code conversa com testes: nomes que revelam intenção, métodos curtos, ausência de efeitos colaterais escondidos e dependências explícitas. Um teste difícil de escrever geralmente indica acoplamento no código de produção.

## Armadilhas comuns

- Testar implementação em vez de comportamento: o teste quebra a cada refactor e ninguém confia nele.
- Muitos mocks: o teste passa, mas não prova integração nenhuma. Prefira fakes e testes de contrato.
- `assertEquals` em `double` sem delta.
- Testes dependentes de ordem ou de estado compartilhado estático.
- Ignorar testes lentos: se a suíte leva 10 minutos, ela deixa de rodar no ciclo local.

## Checklist de domínio

- [ ] Sei estruturar um teste com AAA e nomes descritivos.
- [ ] Uso parametrização para tabelas de casos.
- [ ] Sei testar exceções e mensagens.
- [ ] Configuro e executo `mvn test` sem IDE.
- [ ] Consigo depurar um teste com breakpoint e watch.
- [ ] Reconheço quando um teste está acoplado demais à implementação.

## Para ir além

Leia a documentação do JUnit 5 sobre parameterized tests e extensões, e o guia do Maven sobre o ciclo de vida. Depois escreva testes para uma classe sua que hoje só tem validação manual — comece pelos casos de borda.
