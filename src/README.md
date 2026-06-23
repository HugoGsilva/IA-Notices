# `src/` — estrutura do código

Mapa dos módulos. O fluxo principal é: **providers** buscam notícias →
**pipeline** normaliza, pontua, filtra e deduplica → **db** persiste o histórico
→ **discord** entrega o digest. O **server** e o **scheduler** apenas disparam o
pipeline; a lógica vive no núcleo.

```
src/
  config/      configuração validada do ambiente (Zod)            [implementado]
  domain/      contratos compartilhados (tipos do núcleo)         [implementado]
  http/        cliente HTTP compartilhado (timeout/retry/máscara) [implementado]
  logging/     interface de logger mínima (+ noop)                [implementado]
  providers/   adapters de APIs oficiais + registry + stubs       [implementado]
  pipeline/    normalize, score, filter, dedup, digest, run       [implementado]
  db/          schema, client e repositório (Drizzle + SQLite)    [implementado]
  discord/     entrega via Webhook oficial (Notifier)             [implementado]
  scheduler/   agendamento in-process (node-cron, ADR 0002)       [implementado]
  server/      HTTP: healthcheck + run manual protegido (Fastify) [implementado]
  index.ts     entrypoint: composição + start/shutdown            [implementado]
```

Regras de estrutura (ver `AGENTS.md`):

- O **núcleo** (`pipeline`) opera só sobre tipos normalizados (`domain/`) e não
  conhece providers específicos.
- Toda API externa entra como **provider plugável** atrás da interface
  `NewsProvider`; o `registry` faz a composição (o núcleo nunca importa um
  provider concreto).
- Acesso a dados isolado em `db/` (trocável sem afetar o núcleo).
- Entrega ao Discord atrás da interface `Notifier` (`discord/`), pronta para um
  transporte de bot no futuro.
- Falhas de provider/notifier são **isoladas**: uma fonte com erro não derruba
  as demais nem a aplicação.
