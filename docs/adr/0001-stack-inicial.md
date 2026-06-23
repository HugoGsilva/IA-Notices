# ADR 0001 — Stack inicial do projeto

- **Status:** Aceito
- **Data:** 2026-06-23
- **Decisores:** Mantenedor do projeto + agente de IA
- **Relacionado:** `AGENTS.md` (seções 4, 13, 14)

---

## 1. Contexto

O projeto **IA-Notices** é um backend que busca notícias sobre Inteligência
Artificial em **APIs oficiais**, normaliza, filtra, deduplica, pontua por
relevância, mantém histórico e envia um digest para o Discord.

Requisitos centrais que influenciam a stack:

- Precisa ser **simples de iniciar**, **fácil de rodar localmente** e **pronto
  para Docker**.
- Precisa de **typecheck**, **lint**, **testes** e **CI**.
- Precisa de **providers plugáveis** atrás de uma interface comum.
- Precisa de **HTTP** (healthcheck + endpoint manual protegido), **agendamento**
  e **persistência** para histórico/deduplicação.
- Deve ser **modular**, **extensível** e **adequado para agentes de IA**
  trabalharem no repositório.

Esta é a **primeira decisão arquitetural** do projeto; conforme o `AGENTS.md`,
toda escolha de stack/arquitetura precisa estar registrada em um ADR.

## 2. Decisão

Adotar uma stack **TypeScript + Node.js**, com **Fastify** para HTTP, **Zod**
para validação, **SQLite** como banco no MVP acessado via **Drizzle ORM**,
**Vitest** para testes, **ESLint + Prettier** para qualidade, **Docker** para
empacotamento, **GitHub Actions** para CI e **Discord Webhook** oficial para
entrega.

Onde a recomendação dava opções, decidimos:

- **ORM: Drizzle** (em vez de Prisma).
- **HTTP: Fastify** (confirmando a recomendação, em vez de Express).

## 3. Stack escolhida

| Camada              | Escolha                          | Observação                                            |
| ------------------- | -------------------------------- | ----------------------------------------------------- |
| Linguagem           | **TypeScript**                   | Tipagem estática atende ao requisito de `typecheck`.  |
| Runtime             | **Node.js 20+**                  | LTS, `fetch` nativo, amplo suporte.                   |
| HTTP                | **Fastify**                      | Rápido, schema-first, logger (pino) embutido.         |
| Validação           | **Zod**                          | Validação de env e payloads, inferência de tipos.     |
| Banco (MVP)         | **SQLite** (`better-sqlite3`)    | Zero infra, arquivo único, ideal para MVP local.      |
| ORM                 | **Drizzle ORM** + `drizzle-kit`  | Leve, type-safe, migrações versionadas.               |
| Testes              | **Vitest**                       | Rápido, integra com TS/ESM.                           |
| Lint                | **ESLint** (+ typescript-eslint) | Padrão de mercado, flat config.                       |
| Formatação          | **Prettier**                     | Formatação consistente.                               |
| Dev runner          | **tsx**                          | Execução/watch de TS sem build manual.                |
| Empacotamento       | **Docker** (+ docker-compose)    | Requisito do projeto; build multi-stage.              |
| CI                  | **GitHub Actions**               | lint + typecheck + test + build.                      |
| Entrega ao Discord  | **Discord Webhook** oficial      | Sem bot no MVP; interface preparada para bot futuro.  |
| Agendamento         | A definir em ADR próprio         | Provável `node-cron`; decisão fora do escopo deste ADR. |

## 4. Alternativas consideradas

**Linguagem/runtime**

- _Python (FastAPI)_: ótimo ecossistema, mas o requisito explícito de
  `typecheck` e a natureza I/O-bound (HTTP + agregação de APIs) tornam
  TypeScript/Node uma escolha mais coesa com `lint`/`typecheck` de primeira
  classe e um único toolchain.

**HTTP framework**

- _Express_: simples e onipresente, porém sem validação/schema nem logger
  embutidos. **Fastify** oferece performance, logger (pino) e validação por
  schema integrados, com baixo overhead — melhor para um serviço de backend.

**ORM / acesso a dados**

- _Prisma_: DX excelente, mas exige passo de **geração de cliente** e embarca um
  **query engine** (binário) — mais peso na imagem Docker e mais fricção em
  ambientes restritos.
- _SQL puro com `better-sqlite3`_: máximo controle, porém mais verboso e sem
  migrações versionadas prontas.
- **Drizzle ORM** (escolhido): type-safe, **sem runtime pesado** nem geração de
  cliente obrigatória, migrações via `drizzle-kit`, casa muito bem com SQLite e
  com a meta de imagem Docker enxuta.

**Banco**

- _PostgreSQL_: robusto, mas adiciona infra (serviço/credenciais) que contraria
  "simples para iniciar" no MVP. Drizzle permite **migrar para Postgres depois**
  com baixo atrito (ver seção 8).

## 5. Motivos da escolha

- **Coesão com os requisitos:** TS entrega `typecheck`; ESLint entrega `lint`;
  Vitest entrega testes; Docker/Actions entregam empacotamento e CI.
- **Simplicidade para iniciar:** SQLite + Drizzle não exigem serviço externo;
  `tsx` permite rodar sem build.
- **Imagem Docker enxuta:** Fastify + Drizzle + SQLite evitam binários pesados.
- **Extensibilidade:** Fastify (plugins) e Drizzle (schema versionado) suportam
  o crescimento previsto (novos providers, troca de banco).
- **Aderência ao `AGENTS.md`:** validação por Zod centraliza configuração de
  env; o desacoplamento por interface de provider é natural nessa stack.

## 6. Consequências

**Positivas**

- Toolchain único (TS/Node) para app, testes, lint e build.
- Onboarding rápido: `npm install` + `npm run dev`.
- Fundação pronta para Docker e CI desde o início.
- Tipos compartilhados entre camadas reduzem erros.

**Negativas / custos**

- `better-sqlite3` é um módulo **nativo** (precisa compilar/baixar binário) — o
  Dockerfile deve garantir as ferramentas de build na etapa de instalação.
- Drizzle é mais novo que Prisma; menos material em alguns casos de borda.
- ESM + NodeNext exige imports com extensão `.js` no código TypeScript.

## 7. Riscos

| Risco                                              | Severidade | Mitigação                                                                 |
| -------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| Build nativo de `better-sqlite3` falhar no Docker  | Média      | Imagem base com toolchain de build; fixar versões; cache de dependências. |
| SQLite limitar concorrência/escala no futuro       | Baixa (MVP)| Drizzle facilita migração para Postgres; isolar acesso no repositório.    |
| Maturidade do Drizzle em cenários avançados        | Baixa      | Acesso a dados isolado atrás de um repositório; trocável sem afetar núcleo.|
| Fricção do ESM/NodeNext (`.js` em imports)         | Baixa      | Convenção documentada; `lint`/`typecheck` no CI detectam desvios.         |

## 8. Como reverter futuramente

A decisão é **localizada e reversível**:

- **Trocar o ORM (Drizzle → Prisma):** o acesso a dados fica isolado na camada
  de repositório (`src/db`). Substituir a implementação do repositório sem tocar
  no núcleo. Registrar novo ADR.
- **Trocar o banco (SQLite → PostgreSQL):** Drizzle suporta múltiplos dialetos;
  alterar o driver/conexão e as migrações. O contrato do repositório permanece.
- **Trocar o HTTP (Fastify → outro):** as rotas apenas disparam o pipeline; a
  lógica vive no núcleo. Reescrever a camada `src/server` mantendo os contratos.
- **Trocar a linguagem/runtime:** decisão maior; exigiria novo ADR e reescrita,
  mas os contratos de domínio documentados servem de especificação.

Toda reversão deve: (a) abrir um **novo ADR** que supersede este; (b) manter o
desacoplamento do núcleo; (c) manter `lint`, `typecheck`, testes e build verdes;
(d) manter o projeto funcionando com Docker.
