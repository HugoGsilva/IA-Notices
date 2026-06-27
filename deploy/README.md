# Deploy — Docker Swarm / Portainer

IA-Notices é um **worker headless**: um agendador interno (node-cron) roda o
pipeline e a entrega ao Discord é de **saída**. Nada acessa o serviço pela
internet, então o deploy **não** precisa de domínio, rota Traefik ou porta
publicada.

## Passo a passo

### 1. Publicar a imagem (Swarm não builda)

O Swarm puxa a imagem de um registry. Publique-a uma vez (ou deixe o workflow
de release fazer isso por você — veja abaixo):

```bash
docker build -t hugogsilva/ia-notices:latest .
docker push hugogsilva/ia-notices:latest
```

Se a arquitetura da VPS for diferente da sua máquina:

```bash
docker buildx build --platform linux/amd64 -t hugogsilva/ia-notices:latest --push .
```

### 2. Criar a stack no Portainer

Em **Stacks → Add stack**, cole o conteúdo de
[`portainer-stack.yml`](./portainer-stack.yml) e preencha as variáveis de
ambiente. No mínimo:

| Variável              | Observação                                             |
| --------------------- | ------------------------------------------------------ |
| `DISCORD_WEBHOOK_URL` | **Obrigatória** — destino do digest (segredo).         |
| `SCHEDULE_CRON`       | Frequência (padrão `0 * * * *`, de hora em hora).      |
| `NEWSAPI_KEY` / `GUARDIAN_KEY` | Só se ativar esses providers (`*_ENABLED=true`). |
| `ADMIN_TOKEN`         | Só se for usar o disparo manual `POST /internal/run`.  |

As fontes de alto sinal para dev/IA já vêm habilitadas e **não exigem chave** —
Hacker News, Reddit, Hugging Face (papers) e blogs oficiais via RSS — então o
serviço entrega notícias relevantes sem nenhuma chave de API. O GDELT vem
**desligado** por padrão (notícia mainstream, baixo sinal para dev e com
rate-limit agressivo); ligue com `GDELT_ENABLED=true` se quiser.

Ajustes finos de relevância/volume (sem rebuild) ficam nas variáveis
`HACKERNEWS_MIN_POINTS`, `REDDIT_MIN_UPVOTES`, `REDDIT_SUBREDDITS` e `RSS_FEEDS`
— veja os comentários no [`portainer-stack.yml`](./portainer-stack.yml).

### 3. Subir

Deploy da stack. O agendador começa a rodar e entrega o digest no Discord na
cadência do `SCHEDULE_CRON`.

## Notas importantes

- **`replicas: 1` é obrigatório.** O histórico fica em SQLite (single-writer)
  num volume. Escalar para 2+ corromperia o banco — por isso também não usamos
  rollout `start-first`.
- **Persistência:** o volume `ia-notices-data` guarda o SQLite. Não o remova
  entre deploys, ou o histórico de deduplicação é perdido.
- **Disparo manual remoto (opcional):** para chamar `POST /internal/run` pela
  internet (protegido por `ADMIN_TOKEN`), há um bloco Traefik comentado no
  final do `portainer-stack.yml`. Não é necessário para a operação automática.

## Build & push automático (CI)

O workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml)
builda e publica a imagem no Docker Hub a cada tag `v*` (e em
`workflow_dispatch`). Configure dois segredos no repositório
(**Settings → Secrets and variables → Actions**):

- `DOCKERHUB_USERNAME` — seu usuário do Docker Hub.
- `DOCKERHUB_TOKEN` — um *access token* do Docker Hub (não a senha).

Com isso, publicar uma versão é só criar a tag:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

A imagem sai como `hugogsilva/ia-notices:0.1.0` e `:latest`.
