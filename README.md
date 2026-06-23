# IA-Notices

Backend de curadoria e entrega automática de notícias sobre Inteligência
Artificial no Discord. O sistema busca notícias em **APIs oficiais**, normaliza,
filtra, pontua, deduplica, persiste o histórico e envia um digest formatado para
um canal do Discord via Webhook.

As regras de arquitetura, segurança e contribuição estão em
[`AGENTS.md`](./AGENTS.md). Decisões arquiteturais ficam em
[`docs/adr/`](./docs/adr).

## Stack

TypeScript / Node.js 20+, Fastify, Zod, SQLite + Drizzle, Vitest, ESLint +
Prettier. Entrega via Discord Webhook. CI no GitHub Actions.

## Como rodar (local)

```bash
npm ci
cp .env.example .env   # ajuste os valores; NUNCA comite seu .env
npm run dev            # servidor com reload (tsx watch)
```

Build e execução de produção:

```bash
npm run build
npm start
```

Healthcheck: `GET http://localhost:3000/health`.

### Scripts úteis

| Script                 | Descrição                                  |
| ---------------------- | ------------------------------------------ |
| `npm run dev`          | Servidor em watch mode.                     |
| `npm run check`        | typecheck + lint + testes.                  |
| `npm run build`        | Compila para `dist/`.                       |
| `npm test`             | Testes (Vitest).                            |
| `npm run format:check` | Verifica formatação (Prettier).             |

## Como rodar (Docker)

A imagem não contém segredos; toda configuração entra por variáveis de ambiente
em runtime. O banco SQLite fica em um volume persistente.

```bash
cp .env.example .env   # configure antes de subir
docker compose up --build
```

## Configuração

Toda configuração vem de variáveis de ambiente, validadas no startup (a
aplicação falha com mensagem clara se algo estiver inválido). Defaults são
seguros: providers, entrega no Discord e o agendador ficam **desligados** até
serem explicitamente habilitados.

| Variável              | Default                                          | Descrição                                                        |
| --------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `NODE_ENV`            | `development`                                     | `development` \| `production` \| `test`.                          |
| `HOST`                | `0.0.0.0`                                          | Host de bind do servidor HTTP.                                    |
| `PORT`                | `3000`                                             | Porta do servidor HTTP.                                          |
| `LOG_LEVEL`           | `info`                                             | Nível de log (`fatal`…`silent`).                                 |
| `HTTP_TIMEOUT_MS`     | `10000`                                            | Timeout por tentativa em requisições externas.                  |
| `HTTP_RETRIES`        | `2`                                                | Retentativas após a primeira tentativa.                         |
| `DATABASE_PATH`       | `data/ia-notices.sqlite`                           | Caminho do arquivo SQLite.                                       |
| `NEWSAPI_ENABLED`     | `false`                                            | Habilita o provider NewsAPI.org.                                |
| `NEWSAPI_KEY`         | —                                                  | Chave da NewsAPI.org (**segredo**).                             |
| `GDELT_ENABLED`       | `false`                                            | Habilita o provider GDELT 2.0 (sem chave).                       |
| `NEWS_KEYWORDS`       | `artificial intelligence,machine learning,LLM,AI` | Keywords de IA (separadas por vírgula).                          |
| `NEWS_LANGUAGE`       | `en`                                               | Idioma preferido (ISO 639-1).                                   |
| `NEWS_LOOKBACK_HOURS` | `24`                                               | Janela temporal de busca, em horas.                             |
| `NEWS_MAX_ITEMS`      | `20`                                               | Máximo de itens por execução.                                   |
| `NEWS_MIN_SCORE`      | `1`                                                | Score mínimo para manter/entregar um item.                      |
| `DISCORD_ENABLED`     | `false`                                            | Habilita a entrega no Discord.                                  |
| `DISCORD_WEBHOOK_URL` | —                                                  | URL do Webhook do Discord (**segredo**).                        |
| `SCHEDULE_ENABLED`    | `false`                                            | Habilita a execução agendada.                                   |
| `SCHEDULE_CRON`       | `0 * * * *`                                         | Expressão cron do agendador.                                     |
| `ADMIN_TOKEN`         | —                                                  | Token do endpoint manual protegido (**segredo**).              |

> Segredos (`NEWSAPI_KEY`, `DISCORD_WEBHOOK_URL`, `ADMIN_TOKEN`) nunca devem ser
> commitados. Use `.env` local (ignorado pelo Git) ou o gerenciador de segredos
> do ambiente de deploy.

## Status

Em construção (MVP incremental). Veja `AGENTS.md` (seção 2) para o escopo e
`src/README.md` para o mapa dos módulos.
