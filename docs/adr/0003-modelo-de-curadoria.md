# ADR 0003 — Modelo de curadoria (heurística por keywords)

- **Status:** Aceito
- **Data:** 2026-06-23
- **Decisores:** Mantenedor do projeto + agente de IA
- **Relacionado:** `AGENTS.md` (seções 1, 2), ADR 0001

---

## 1. Contexto

O pipeline precisa **filtrar**, **pontuar** e **categorizar** notícias por
relevância de IA antes de persistir e entregar o digest (`AGENTS.md`, seção 1).
Havia duas abordagens para o MVP: heurística determinística por palavras-chave
ou um passo de classificação/sumarização via LLM.

## 2. Decisão

Adotar, no MVP, uma **curadoria heurística determinística**, implementada como
funções puras em `src/pipeline`:

- **Score:** cada keyword encontrada no título pesa mais que na descrição; um
  **bônus de recência** reforça itens frescos, mas **só** quando há ao menos um
  match de keyword (recência não torna relevante um item sem match).
- **Categorias:** as keywords que casaram viram as categorias do item.
- **Filtro:** mantém itens com score ≥ `NEWS_MIN_SCORE`, dentro da janela
  temporal e com idioma compatível.
- **Deduplicação:** por `dedupKey` (URL canônica; título como fallback), no lote
  e contra o histórico.

Um eventual passo de **LLM fica fora do escopo do MVP**.

## 3. Alternativas consideradas

- **Classificação/sumarização via LLM:** melhor qualidade semântica e resumos,
  porém adiciona um provider de IA, **chave/segredo**, custo por chamada,
  latência e **não-determinismo** — o que complica testes offline determinísticos
  exigidos pelo `AGENTS.md` (seção 9) e amplia o escopo do MVP.
- **Heurística por keywords** (escolhida): determinística, offline, sem custo nem
  segredos adicionais, trivialmente testável e suficiente para o objetivo inicial
  de relevância de IA.

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
