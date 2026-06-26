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

GDELT já vem habilitado e não exige chave, então o serviço entrega notícias
mesmo sem nenhuma chave de API.

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
builda e publica a imagem no Docker Hub automaticamente:

- **a cada push na `main`** → publica `:latest` (mais uma tag `sha-<commit>` para
  rastreabilidade/rollback). **Este é o caminho de deploy automático**: todo
  merge na main atualiza a imagem que a stack puxa.
- **a cada tag `v*`** → publica as versões semver (`0.1.0`, `0.1`).

Configure dois segredos no repositório
(**Settings → Secrets and variables → Actions**):

- `DOCKERHUB_USERNAME` — seu usuário do Docker Hub.
- `DOCKERHUB_TOKEN` — um *access token* do Docker Hub (não a senha).

Com isso, basta dar merge na `main` que o `:latest` é reconstruído. Para marcar
uma versão estável, crie a tag:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

> O build **não** reinicia o container — ele só mantém o `:latest` atualizado.
> Depois do merge, é só clicar em **Update/Pull** na stack do Portainer e a
> imagem já estará correta.
