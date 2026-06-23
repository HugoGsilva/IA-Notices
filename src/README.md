# `src/` — estrutura do código

Mapa da fundação e dos módulos previstos. Diretórios com `.gitkeep` ainda **não
têm implementação** (serão preenchidos em etapas futuras, sempre respeitando o
`AGENTS.md`).

```
src/
  config/      configuração validada do ambiente (Zod)   [implementado]
  server/      servidor HTTP (Fastify) + healthcheck      [implementado]
  index.ts     entrypoint da aplicação                    [implementado]

  providers/   adapters de APIs oficiais (plugáveis)      [futuro]
  pipeline/    normalização, score, deduplicação, fluxo   [futuro]
  db/          acesso a dados (Drizzle + SQLite)          [futuro]
  discord/     entrega via Webhook oficial                [futuro]
```

Regras de estrutura (ver `AGENTS.md`):

- O **núcleo** (`pipeline`) não conhece providers específicos.
- Toda API externa entra como **provider plugável** atrás de uma interface comum.
- Acesso a dados isolado em `db/` (trocável sem afetar o núcleo).
- Entrega ao Discord atrás de uma interface (`discord/`), pronta para bot futuro.
