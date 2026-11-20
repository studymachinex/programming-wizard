> **Em uma frase:** Command transforma uma ação em objeto — e é isso que permite enfileirar, desfazer, auditar e reexecutar sem espalhar `if` pelo código.

Um serviço que executa operações diretamente no domínio conhece cada detalhe de quando e como executar. Quando surge a necessidade de undo, retry, fila ou auditoria, ele ganha condicionais por todo lado. Command separa a intenção da execução.

## O problema

Um editor precisa desfazer digitação, um sistema financeiro precisa reexecutar um lote após falha e uma fila precisa persistir operações. Se cada ação é um método com efeitos colaterais, desfazer exige um `switch` gigante e a fila não sabe serializar a intenção. O acoplamento entre quem pede e quem executa impede evolução.

## Como funciona

Command tem quatro peças: comando, parâmetros, receptor e invocador. O comando encapsula a chamada; o invocador só chama `execute()`.

```java
interface Comando {
    void execute();
    void undo();
}

class Depositar implements Comando {
    private final Conta conta;
    private final BigDecimal valor;

    Depositar(Conta conta, BigDecimal valor) {
        this.conta = conta;
        this.valor = valor;
    }

    public void execute() { conta.creditar(valor); }
    public void undo()    { conta.debitar(valor); }
}

class Historico {
    private final Deque<Comando> feitos = new ArrayDeque<>();

    void executar(Comando c) {
        c.execute();
        feitos.push(c);
    }

    void desfazer() {
        if (!feitos.isEmpty()) feitos.pop().undo();
    }
}
```

Para filas, o comando precisa ser serializável: guarde tipo e payload, não referências vivas. Um `ComandoFactory` reconstrói a instância no consumidor.

## Na prática

Use Command quando: precisa de undo/redo, fila persistente, agendamento, auditoria ou macro de operações. Não use quando a ação é trivial e local — um método direto é mais simples.

Em sistemas distribuídos, Command vira mensagem de comando com idempotência. O receptor deve tratar execução duplicada sem efeito duplo; o invocador precisa de timeout e retry. Undo distribuído é compensação, não rollback mágico.

## Armadilhas comuns

- Comando que guarda o receptor inteiro e quebra na serialização.
- `undo` que não é o inverso exato (ex.: `set` em vez de `add`).
- Histórico ilimitado consumindo memória.
- Comando com lógica de negócio duplicada do domínio.
- Fila de comandos sem idempotência.

## Checklist de domínio

- [ ] Sei separar intenção, parâmetros e receptor.
- [ ] Implemento undo simétrico e testado.
- [ ] Sei serializar comandos para fila.
- [ ] Trato duplicação e falha parcial.
- [ ] Reconheço quando um método direto basta.

## Para ir além

Leia o capítulo de Command em refactoring.guru e implemente um editor com undo/redo e histórico limitado. Depois adicione persistência de comandos em JSON.
