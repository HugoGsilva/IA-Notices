# ADR 0002 — Mecanismo de agendamento (node-cron)

- **Status:** Aceito
- **Data:** 2026-06-23
- **Decisores:** Mantenedor do projeto + agente de IA
- **Relacionado:** `AGENTS.md` (seções 2, 4, 14), ADR 0001

---

## 1. Contexto

O MVP precisa executar o pipeline de curadoria **periodicamente** (ex.: de hora
em hora), além do disparo manual via endpoint protegido. O ADR 0001 deixou a
escolha do agendador explicitamente para um ADR próprio (seção 3, linha
"Agendamento — A definir em ADR próprio").

Requisitos:

- Agendamento **in-process** (sem serviço externo), coerente com "simples de
  iniciar" e "pronto para Docker".
- Expressão de agendamento **configurável por variável de ambiente**
  (`SCHEDULE_CRON`) e **desligável** (`SCHEDULE_ENABLED`), com defaults seguros.
- O agendador apenas **dispara** o pipeline; nenhuma lógica de negócio vive nele
  (regra de arquitetura do `AGENTS.md`).

## 2. Decisão

Adotar **`node-cron`** como agendador in-process. Uma fina camada
(`src/scheduler/scheduler.ts`) encapsula a biblioteca: valida a expressão cron,
agenda a tarefa quando habilitada e garante que execuções não se sobreponham.

## 3. Alternativas consideradas

- **`setInterval` nativo:** zero dependência, mas só suporta intervalos fixos
  (não expressões cron como "todo dia às 9h") e exigiria código próprio para
  parsing/validação. Menos expressivo para a configuração desejada.
- **`node-schedule`:** suporta cron e datas, porém é mais pesado e menos focado;
  o caso de uso do MVP é puramente cron recorrente.
- **Cron do sistema operacional / cron do orquestrador (k8s CronJob):** empurra
  o agendamento para fora da aplicação, contrariando "simples de rodar
  localmente" e exigindo um modo CLI de execução única. Pode ser adotado no
  futuro para deploys gerenciados (ver seção 6).
- **`node-cron`** (escolhido): pequeno, sem dependências pesadas, API simples
  (`schedule`/`validate`), suficiente para expressões cron configuráveis.

## 4. Consequências

**Positivas**

- Agendamento configurável e desligável por env, in-process, sem infra extra.
- Implementação isolada atrás de uma camada fina, fácil de testar e substituir.

**Negativas / custos**

- Uma dependência de runtime a mais (`node-cron`) e seus tipos em devDeps.
- Agendamento in-process pressupõe **uma única instância** ativa; múltiplas
  réplicas executariam o pipeline em paralelo (ver mitigação na seção 5).

## 5. Riscos

| Risco                                            | Severidade  | Mitigação                                                                 |
| ------------------------------------------------ | ----------- | ------------------------------------------------------------------------- |
| Execuções sobrepostas se uma rodada demorar       | Média       | Guard de "execução em andamento" no scheduler; pular se já estiver rodando. |
| Múltiplas réplicas disparando em paralelo         | Baixa (MVP) | MVP roda instância única; deduplicação por `dedupKey` evita duplicatas no BD. |
| Expressão cron inválida em runtime                | Baixa       | Validar com `cron.validate` no startup; falhar/avisar com mensagem clara.  |

## 6. Como reverter futuramente

A decisão é **localizada e reversível**: o agendador vive apenas em
`src/scheduler` e só chama o runner do pipeline. Para trocar por cron do SO,
CronJob do Kubernetes ou outra biblioteca, basta substituir essa camada (e, se
necessário, expor um modo de execução única), abrindo um **novo ADR** que
supersede este. O contrato com o pipeline (`runPipeline`) permanece inalterado.
