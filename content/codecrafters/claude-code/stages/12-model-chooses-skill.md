Até aqui só o usuário invocava skills. Agora o **modelo** decide: se a lista de skills
(stage 7) tiver algo útil, ele carrega as instruções por conta própria.

## O que você vai aprender

- a fechar o ciclo do *progressive disclosure*: descrição no prompt, corpo sob demanda;
- a expor uma capacidade do agente como ferramenta.

## O que fazer

1. Quando houver skills, anuncie a ferramenta `skill`:
   - `name` (obrigatório) — o nome da skill;
   - `arguments` (opcional) — texto para `$ARGUMENTS`.
2. Ao executar, devolva o corpo renderizado do `SKILL.md` (com `$ARGUMENTS` e
   `${SKILL_DIR}` substituídos) como resultado.
3. Para um nome desconhecido, devolva um erro como resultado.

## Como o tester valida

- cria duas skills e envia um prompt comum;
- confere o anúncio de `skill` com `name` obrigatório;
- o modelo chama `skill` com o nome de uma delas;
- confere que o resultado tem o corpo daquela skill.

## Dicas

- Reaproveite a função de renderização dos stages 9 e 11.
- O corpo volta como resultado de ferramenta; o modelo segue as instruções nos próximos turnos.

## Critério de conclusão

O modelo consegue carregar uma skill pelo nome.
