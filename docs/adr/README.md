# Architecture Decision Records (ADR)

Este diretório guarda os **registros de decisão arquitetural** do projeto.
Conforme o `AGENTS.md` (seção 14), **toda mudança arquitetural deve ser
justificada em um ADR** antes de ser implementada.

## Convenções

- Arquivos nomeados como `NNNN-titulo-curto.md` (ex.: `0001-stack-inicial.md`),
  com numeração sequencial e incremental.
- Um ADR é **imutável** após aceito. Para mudar uma decisão, crie um **novo**
  ADR que **supersede** o anterior (referenciando-o), em vez de editar o antigo.
- Status possíveis: `Proposto`, `Aceito`, `Substituído por NNNN`, `Rejeitado`.

## Estrutura mínima de um ADR

1. Contexto
2. Decisão
3. Stack/escopo da decisão
4. Alternativas consideradas
5. Motivos da escolha
6. Consequências
7. Riscos
8. Como reverter futuramente

## Índice

| ADR                                       | Título                | Status |
| ----------------------------------------- | --------------------- | ------ |
| [0001](./0001-stack-inicial.md)           | Stack inicial         | Aceito |
| [0002](./0002-agendamento.md)             | Agendamento (node-cron) | Aceito |
| [0003](./0003-modelo-de-curadoria.md)     | Modelo de curadoria   | Aceito |
