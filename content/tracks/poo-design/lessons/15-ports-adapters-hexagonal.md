> **Em uma frase:** ports and adapters coloca o domínio no centro e trata banco, HTTP e Kafka como detalhes plugáveis — o teste prova isso sem subir infraestrutura.

Arquitetura hexagonal não é pasta com nome bonito. É uma regra de dependência: o domínio não conhece frameworks. Ele expõe portas (interfaces) e o mundo externo implementa adaptadores. Se o banco muda, o domínio não muda.

## O problema

Um serviço de matrícula tem regra de negócio dentro do controller, SQL no service e `@Transactional` no domínio. Testar a regra exige subir o container CDI e o PostgreSQL. Trocar o gateway de pagamento exige editar a classe de negócio. O framework virou o centro — e o negócio, um detalhe.

## Como funciona

Três zonas:

1. **Domínio:** entidades, value objects, regras e portas.
2. **Aplicação:** casos de uso que orquestram o domínio.
3. **Adaptadores:** web, persistência, mensageria.

```java
// porta de saída
interface MatriculaRepositorio {
    boolean existeAlunoAtivo(String alunoId);
    void salvar(Matricula m);
}

// caso de uso
class MatricularAluno {
    private final MatriculaRepositorio repo;
    private final Relogio relogio;

    MatricularAluno(MatriculaRepositorio repo, Relogio relogio) {
        this.repo = repo;
        this.relogio = relogio;
    }

    Matricula executar(String alunoId, String turmaId) {
        if (repo.existeAlunoAtivo(alunoId)) {
            throw new RegraViolada("aluno já possui matrícula ativa");
        }
        var m = Matricula.criar(alunoId, turmaId, relogio.agora());
        repo.salvar(m);
        return m;
    }
}
```

O adaptador JPA implementa a porta; o controller chama o caso de uso. O domínio não importa `jakarta.persistence`.

Teste com fake:

```java
class FakeRepo implements MatriculaRepositorio {
    final Map<String, Matricula> dados = new HashMap<>();
    public boolean existeAlunoAtivo(String id) { return dados.containsKey(id); }
    public void salvar(Matricula m) { dados.put(m.alunoId(), m); }
}

@Test
void impedeMatriculaDuplicada() {
    var repo = new FakeRepo();
    repo.salvar(Matricula.criar("a1", "t1", Instant.now()));
    var caso = new MatricularAluno(repo, () -> Instant.now());
    assertThrows(RegraViolada.class, () -> caso.executar("a1", "t2"));
}
```

## Na prática

Organize por feature, não por tecnologia: `matricula/dominio`, `matricula/aplicacao`, `matricula/adaptadores`. Use DTOs na borda para não vazar entidades JPA. Valide na entrada, mas mantenha invariantes no domínio.

Não crie uma porta para tudo. Repositórios, clientes externos e relógio são candidatos naturais. Um `CalculadoraDeDesconto` puro não precisa de interface.

## Armadilhas comuns

- Porta que espelha o ORM (`save`, `flush`, `findById`) em vez do negócio.
- Domínio anêmico: regra no service, entidade só com getters.
- Adaptador importado pelo domínio "só para um teste".
- Excesso de camadas para um CRUD simples.
- `@Transactional` no caso de uso e domínio achando que é a mesma coisa.

## Checklist de domínio

- [ ] Sei apontar a direção das dependências.
- [ ] Testo regra de negócio sem subir o Quarkus.
- [ ] Separo porta de saída e adaptador.
- [ ] Não vazo entidade JPA para a web.
- [ ] Sei quando a arquitetura é overkill.

## Para ir além

Leia "Hexagonal Architecture" de Alistair Cockburn e o capítulo de arquitetura limpa de Martin Fowler. Depois extraia uma regra de negócio de um controller para um caso de uso testável.
