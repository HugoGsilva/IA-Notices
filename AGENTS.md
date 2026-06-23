# AGENTS.md

Guia obrigatório para agentes de IA (e pessoas) que trabalham neste repositório.
Leia este documento **antes** de qualquer alteração. Ele tem precedência sobre
conveniência, velocidade ou preferências pessoais. Em caso de conflito entre uma
instrução pontual e as regras aqui descritas, **as regras deste documento
prevalecem** — quando houver dúvida real, pare e peça esclarecimento.

---

## 1. Objetivo do projeto

Construir um **backend de curadoria e entrega automática de notícias sobre
Inteligência Artificial no Discord**. O sistema:

1. busca notícias sobre IA em **APIs oficiais e consolidadas** do mercado;
2. **normaliza** os dados em um formato comum;
3. **filtra** conteúdo relevante por temas de IA;
4. **remove duplicatas**;
5. **categoriza** e calcula um **score de relevância**;
6. mantém **histórico** em banco de dados;
7. envia um **digest formatado** para um canal do Discord.

Prioridades de design, sempre nesta ordem: **clareza → simplicidade →
segurança → manutenção → extensibilidade**.

---

## 2. Escopo do MVP

**Dentro do MVP:**

- Providers de notícias plugáveis, com **NewsAPI.org** e **GDELT 2.0 DOC API**
  implementados.
- Normalização, curadoria, score, deduplicação.
- Banco de dados para histórico e deduplicação entre execuções.
- Envio para Discord via **Webhook oficial**.
- Execução **agendada** + **endpoint manual protegido** + **healthcheck**.
- Docker, `.env.example`, CI, testes, lint, typecheck.
- Documentação e este `AGENTS.md`.

**Fora do MVP (apenas previstos na arquitetura, não implementar agora):**

- Providers adicionais: **Event Registry / NewsAPI.ai**, **The Guardian Open
  Platform**, **New York Times Article Search API**, **Mediastack** — devem
  existir como _stubs_ que seguem a interface comum, desabilitados por padrão.
- **Bot do Discord** (o MVP usa apenas Webhook; a arquitetura deve permitir um
  transporte de bot no futuro, atrás da mesma interface de notificação).
- RSS como **complemento secundário** (nunca como fonte principal).

Não amplie o escopo do MVP sem justificativa documentada (ver seção 14).

---

## 3. Regras obrigatórias de segurança

- **Nunca** exponha segredos (API keys, tokens, URLs de webhook) em código,
  logs, mensagens de erro, testes, commits ou documentação.
- **Nunca** commite o arquivo `.env`. Apenas o `.env.example` (sem valores
  reais) pode ser versionado.
- **Nunca** imprima API keys, tokens ou webhooks em logs — nem em nível
  `debug`. Ao logar URLs externas, remova querystring/credenciais.
- **Toda** configuração sensível vem de **variável de ambiente**, validada no
  startup. Não há segredos hardcoded.
- **Todo** endpoint interno/administrativo (ex.: disparo manual do pipeline)
  deve ser **protegido por token administrativo**, comparado em **tempo
  constante**.
- **Nunca** remova, enfraqueça ou contorne validações de segurança existentes
  (validação de env, autenticação de endpoints, sanitização de entrada).
- Falhas de provider externo **não podem derrubar** a aplicação nem vazar
  detalhes sensíveis para o cliente HTTP.
- Dependências devem ser oficiais e mantidas; evite bibliotecas abandonadas.

---

## 4. Regras obrigatórias de arquitetura

- A aplicação **não pode depender diretamente** de nenhuma API de notícias
  específica. Toda API externa é acessada **somente** através de um **provider
  plugável** que implementa a interface comum (ver seção 13).
- O **núcleo** (normalização, curadoria, score, deduplicação, persistência,
  formatação) **não conhece** detalhes de nenhum provider específico — opera
  sobre tipos normalizados.
- O **transporte de notificação** (Discord) deve estar atrás de uma interface
  (`Notifier`), permitindo trocar Webhook por Bot no futuro sem mexer no núcleo.
- O **agendador** e o **servidor HTTP** apenas **disparam** o pipeline; a lógica
  de negócio vive no pipeline/núcleo, não nas camadas de entrada.
- Configuração centralizada e tipada (uma única fonte de verdade para o
  ambiente). Nada de `process.env` espalhado pelo código.
- Camadas com responsabilidade única e baixo acoplamento. Sem ciclos de
  dependência entre módulos.
- Mantenha o projeto **simples de rodar localmente** e **pronto para Docker** a
  todo momento.

---

## 5. APIs de notícias permitidas

Apenas **APIs oficiais, documentadas e estáveis**. A arquitetura prevê
adaptadores para:

| Provider                              | Status no MVP | Documentação oficial                                   |
| ------------------------------------- | ------------- | ------------------------------------------------------ |
| **NewsAPI.org**                       | Implementar   | https://newsapi.org/docs                               |
| **GDELT 2.0 DOC API**                 | Implementar   | https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts |
| **Event Registry / NewsAPI.ai**       | Previsto      | https://eventregistry.org/documentation                |
| **The Guardian Open Platform**        | Previsto      | https://open-platform.theguardian.com/documentation    |
| **New York Times Article Search API** | Previsto      | https://developer.nytimes.com/docs                      |
| **Mediastack**                        | Previsto      | https://mediastack.com/documentation                    |

Qualquer novo provider precisa: (a) ser uma API **oficial** do serviço;
(b) ter documentação pública clara; (c) seguir a interface comum; (d) ser
plugável e desabilitável por configuração.

---

## 6. APIs e técnicas proibidas

É **proibido** introduzir:

- ❌ **Scraping** direto de sites de notícias.
- ❌ **Google News scraping** ou **APIs não oficiais do Google News**.
- ❌ **RSS aleatório como fonte principal** (RSS só pode ser complemento
  secundário, no futuro, nunca no MVP).
- ❌ **Crawlers improvisados**.
- ❌ APIs **sem documentação clara**.
- ❌ **Wrappers não oficiais** como fonte primária.
- ❌ **APIs descontinuadas**.
- ❌ **Bibliotecas abandonadas**.

Se a única forma de obter uma fonte for por um meio proibido, **não a adicione**
e registre a limitação na documentação.

---

## 7. Regras sobre variáveis de ambiente

- Toda configuração (incluindo flags de provider, parâmetros de curadoria,
  agendamento) vem de **variáveis de ambiente**.
- **Toda** variável nova deve ser:
  1. adicionada ao **`.env.example`** com comentário explicativo e valor de
     exemplo **não sensível**;
  2. incluída na **validação de configuração** (schema tipado) com default
     seguro quando aplicável;
  3. **documentada no README**.
- Defaults devem ser **seguros**: nada que ative envio real ou exponha o sistema
  sem configuração explícita.
- A aplicação deve **falhar no startup com mensagem clara** se a configuração
  for inválida.

---

## 8. Regras sobre segredos

- Segredos **nunca** entram no repositório. Apenas em `.env` local (ignorado
  pelo Git) ou no gerenciador de segredos do ambiente de deploy.
- `.env` está no `.gitignore` e **assim deve permanecer**.
- Não inclua segredos em fixtures, snapshots de teste, exemplos ou mensagens de
  commit/PR.
- Ao logar, **mascare** qualquer valor sensível. URLs de webhook e keys nunca
  aparecem em texto puro nos logs.
- Se um segredo for exposto acidentalmente, trate como incidente: rotacione a
  credencial e remova do histórico.

---

## 9. Regras sobre testes

- **Toda alteração de lógica deve ter teste.** Sem teste, não está pronto.
- O núcleo (normalização, score, deduplicação, categorização, formatação do
  digest) deve ter **testes unitários**.
- Providers são testados com **respostas mockadas** — **nunca** faça chamadas de
  rede reais nos testes; **nunca** use segredos reais.
- Testes devem ser **determinísticos** e rodar offline.
- O banco em testes usa instância **in-memory/temporária**, isolada por teste.
- Correções de bug acompanham um teste que reproduz o bug.

---

## 10. Regras sobre commits e pull requests

- Use o **GitHub CLI (`gh`)** para o fluxo de PRs quando aplicável.
- **Não crie Pull Request sem solicitação explícita** do mantenedor.
- Commits pequenos, focados e com mensagem descritiva (imperativo, ex.:
  "add gdelt provider"). Um commit não deve misturar refactor + feature + fix.
- **Nunca** commite `.env`, segredos, `node_modules/`, `dist/` ou o arquivo de
  banco de dados.
- Antes de commitar, rode o **checklist da seção 15**. Não commite com lint,
  typecheck, testes ou build quebrados.
- Descrições de PR devem explicar **o quê** e **o porquê**, listar mudanças de
  configuração e referenciar ADR quando houver mudança arquitetural.
- Trabalhe na branch designada para a tarefa; **não** faça push em outra branch
  sem permissão explícita.

---

## 11. Regras sobre documentação

- **Toda alteração de configuração atualiza o README** (variáveis, como rodar,
  como configurar providers).
- Novos providers, endpoints ou comportamentos relevantes devem ser
  documentados.
- Mantenha `.env.example`, README e este `AGENTS.md` **coerentes** com o código.
- Mudanças arquiteturais exigem um **ADR** (ver seção 14).
- Documentação faz parte da definição de "pronto"; PR sem doc correspondente
  está incompleto.

---

## 12. Regras sobre Docker

- O projeto **deve continuar funcionando com Docker** a todo momento.
- Mantenha o `Dockerfile` e o `docker-compose` atualizados quando mudar build,
  dependências de sistema, comandos de start, portas ou volumes.
- A imagem **não** deve conter segredos; configuração entra por variáveis de
  ambiente em runtime.
- Use `.dockerignore` para excluir `node_modules`, `dist`, `.env`, dados e
  artefatos de teste.
- O banco/dados persistentes ficam em **volume**, não dentro da imagem.
- Healthcheck deve continuar acessível no container.

---

## 13. Como adicionar novos providers

Um provider é a **única** forma permitida de integrar uma fonte externa.

Passos:

1. Confirme que a fonte é uma **API oficial, documentada e permitida**
   (seções 5 e 6).
2. Crie o adapter implementando a **interface comum** `NewsProvider`.
3. Use o cliente HTTP compartilhado (timeout + retentativa) e **não** exponha
   segredos em logs.
4. Leia a configuração (key/flag) **somente** da camada de configuração
   centralizada; adicione as variáveis ao `.env.example`, ao schema e ao README.
5. O provider deve ser **desabilitável**: se a flag estiver `false` ou faltar a
   key, `enabled` é `false` e ele não é executado.
6. Registre o provider no **registry**; o núcleo não deve referenciá-lo
   diretamente.
7. Adicione **testes** com respostas mockadas (sucesso, vazio e erro).
8. Normalize a saída para o tipo comum — o núcleo nunca vê o formato cru do
   provider.
9. Falhas de um provider devem ser **isoladas** e não interromper os demais.

A aplicação **nunca** importa um provider específico fora do registry/composição.

---

## 14. Como alterar a arquitetura

- **Toda mudança arquitetural deve ser justificada em um documento ADR**
  (Architecture Decision Record), em `docs/adr/NNNN-titulo.md`.
- O ADR registra: **contexto**, **decisão**, **alternativas consideradas** e
  **consequências**.
- Mudanças que exigem ADR incluem: trocar banco, framework HTTP, mecanismo de
  agendamento, transporte de notificação, contrato de provider, ou qualquer
  alteração no contrato entre camadas.
- Não quebre a interface comum de providers nem o desacoplamento do núcleo sem
  ADR aprovado.
- Refatorações devem **preservar comportamento** e estar cobertas por testes.

---

## 15. Checklist obrigatório antes de finalizar uma tarefa

Marque **todos** os itens antes de considerar a tarefa concluída:

- [ ] `lint` passou.
- [ ] `typecheck` passou.
- [ ] `test` (todos os testes) passou.
- [ ] `build` passou.
- [ ] O projeto **continua funcionando com Docker**.
- [ ] Nenhum segredo foi adicionado ao código, logs, testes ou commits.
- [ ] `.env` **não** foi commitado; `.env.example` atualizado se houver nova
      variável.
- [ ] README atualizado se a configuração mudou.
- [ ] ADR criado/atualizado se houve mudança arquitetural.
- [ ] Toda nova lógica tem teste correspondente.
- [ ] Nenhuma técnica/API proibida foi introduzida (seção 6).
- [ ] Nenhuma validação de segurança foi removida ou enfraquecida.
- [ ] Novas fontes externas estão atrás da interface de provider e são
      plugáveis/desabilitáveis.

---

## Regras explícitas (resumo de não-negociáveis)

- ❌ Não adicionar **scraping**.
- ❌ Não adicionar **Google News não oficial**.
- ❌ Não adicionar **RSS aleatório como fonte principal**.
- ❌ Não usar **APIs descontinuadas**.
- ❌ Não usar **wrappers não oficiais como fonte primária**.
- ❌ Não **expor segredos**.
- ❌ Não **commitar `.env`**.
- ❌ Não **imprimir API keys, tokens ou webhooks em logs**.
- ❌ Não **remover validações de segurança**.
- ❌ Não **criar dependência direta da aplicação em uma API específica**.
- ✅ Toda **API externa** deve ser um **provider plugável**.
- ✅ Todo **provider** deve seguir uma **interface comum**.
- ✅ Toda **configuração sensível** vem de **variável de ambiente**.
- ✅ Todo **endpoint interno** deve ser protegido por **token administrativo**.
- ✅ Toda **alteração de lógica** deve ter **teste**.
- ✅ Toda **alteração de configuração** deve atualizar o **README**.
- ✅ Toda **mudança arquitetural** deve ser justificada em **ADR**.
- ✅ Toda **task** deve terminar com **lint, typecheck, testes e build passando**.
- ✅ O projeto deve **continuar funcionando com Docker**.

---

## Interface conceitual obrigatória

Todo provider de notícias **deve** seguir uma interface comum semelhante a esta.
Os nomes/campos exatos podem evoluir, mas o **contrato** (provider plugável,
identificável, desabilitável e que retorna itens crus normalizáveis) é
obrigatório:

```ts
interface NewsProvider {
  name: string;
  enabled: boolean;
  search(query: NewsSearchQuery): Promise<RawNewsItem[]>;
}

// Critérios de busca repassados a todos os providers de forma uniforme.
interface NewsSearchQuery {
  keywords: string[]; // termos/temas de IA a buscar
  from: Date; // janela temporal (limite inferior)
  language: string; // idioma preferido (ISO 639-1), quando suportado
  limit: number; // limite máximo de itens
}

// Item "cru" retornado por um provider, antes da normalização do núcleo.
interface RawNewsItem {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string; // ISO-8601, quando disponível
  description?: string;
  imageUrl?: string;
  language?: string;
  provider: string; // nome do provider de origem
}
```

Regras do contrato:

- `name` é único e estável.
- `enabled` reflete configuração + presença de credenciais; se `false`, o
  provider **não** é executado.
- `search` **não lança** em resultado vazio (retorna `[]`); erros de rede/HTTP
  são tratados e isolados.
- A saída (`RawNewsItem[]`) é **normalizada pelo núcleo** para o tipo interno; o
  núcleo nunca lida com o formato específico de cada API.
