# ADR 0003 — Modelo de curadoria (heurística por keywords)

- **Status:** Aceito
- **Data:** 2026-10-03
- **Decisores:** Mantenedor do projeto + agente de IA
- **Relacionado:** `AGENTS.md` (seções 1, 2), ADR 0001

---

## 1. Contexto

O pipeline precisa **filtrar**, **pontuar** e **categorizar** notícias por
relevância de IA antes de persistir e entregar o digest (`AGENTS.md`, seção 1).
Havia duas abordagens para o MVP: heurística determinística por palavras-chave
ou um passo de classificação/sumarização via LLM.

## 2. Decisão

Adotar uma **curadoria heurística determinística em múltiplos sinais**, implementada como
funções puras em `src/pipeline`. A estratégia continua sem LLM, mas deixa de tratar
toda menção a "AI" como equivalente:

- **Score:** keywords específicas de modelos, produtos, técnicas e organizações
  pesam mais que termos genéricos; eventos concretos (lançamento, release,
  pesquisa, segurança, financiamento, regulação etc.), fatos quantitativos e
  fontes primárias/editoriais confiáveis recebem bônus. Recência reforça itens
  que já possuem sinal de relevância.
- **Penalização anti-slop:** títulos/descriptions com padrões de tutorial, lista
  SEO, opinião, newsletter, conteúdo patrocinado, prompt packs e outras formas de
  baixo valor-notícia sofrem penalização forte; sinais promocionais explícitos
  são penalizados ainda mais.
- **Filtro:** mantém itens com score ≥ `NEWS_MIN_SCORE` e exige pelo menos um
  sinal significativo de notícia/IA; também aplica janela temporal, idioma,
  script e tipo de link.
- **Categorias:** as keywords que casaram continuam sendo armazenadas como
  categorias do item.
- **Deduplicação:** por `dedupKey` (URL canônica; título como fallback), no lote
  e contra o histórico.

Um eventual passo de **LLM fica fora do escopo desta alteração**.

## 3. Alternativas consideradas

- **Classificação/sumarização via LLM:** melhor qualidade semântica e resumos,
  porém adiciona um provider de IA, chave/segredo, custo por chamada, latência
  e não-determinismo — além de ampliar o escopo e dificultar os testes offline.
- **Heurística simples por keywords**: menor complexidade, mas permitia que
  menções genéricas e conteúdo SEO/clickbait alcançassem o limite.
- **Heurística em múltiplos sinais (escolhida):** continua determinística, offline
  e sem custo, mas combina especificidade do termo, novidade/evento, sinais
  concretos, qualidade da fonte e penalização explícita de slop.

## 4. Consequências

**Positivas**

- Testes unitários determinísticos e rápidos; nenhuma dependência externa nova.
- Sem custo de API nem segredos adicionais para curar.
- Lógica simples e transparente, fácil de ajustar (pesos, keywords, thresholds).

**Negativas / custos**

- Relevância limitada a correspondência de termos; sem compreensão semântica nem
  resumo gerado. Pode exigir curadoria das `NEWS_KEYWORDS` para bons resultados.

## 5. Como evoluir futuramente

Introduzir LLM seria uma **mudança arquitetural** e exige **novo ADR**. O caminho
natural: um passo opcional de enriquecimento atrás de uma interface, desabilitável
por configuração, com chamadas mockadas nos testes e segredos só via ambiente —
preservando o núcleo determinístico atual como base.
