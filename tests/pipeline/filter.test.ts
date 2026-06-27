import { describe, expect, it } from 'vitest';
import { filterItems } from '../../src/pipeline/filter.js';
import type { NewsItem } from '../../src/domain/types.js';

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: 't',
    url: 'https://example.com/a',
    source: null,
    publishedAt: '2026-06-23T00:00:00.000Z',
    description: null,
    imageUrl: null,
    language: null,
    provider: 'p',
    score: 5,
    categories: [],
    dedupKey: 'k',
    fetchedAt: '2026-06-23T01:00:00.000Z',
    ...overrides,
  };
}

const options = {
  from: new Date('2026-06-22T00:00:00.000Z'),
  language: 'en',
  minScore: 2,
};

describe('filterItems', () => {
  it('drops items below the minimum score', () => {
    const result = filterItems([item({ score: 1 }), item({ score: 2 })], options);
    expect(result).toHaveLength(1);
    expect(result[0]?.score).toBe(2);
  });

  it('drops items published before the window but keeps unknown dates', () => {
    const result = filterItems(
      [
        item({ dedupKey: 'old', publishedAt: '2026-06-01T00:00:00.000Z' }),
        item({ dedupKey: 'in', publishedAt: '2026-06-23T00:00:00.000Z' }),
        item({ dedupKey: 'unknown', publishedAt: null }),
      ],
      options,
    );
    expect(result.map((i) => i.dedupKey)).toEqual(['in', 'unknown']);
  });

  it('keeps English and Portuguese, drops other declared languages', () => {
    const result = filterItems(
      [
        item({ dedupKey: 'pt', language: 'pt' }),
        item({ dedupKey: 'pt-br', language: 'pt-BR' }),
        item({ dedupKey: 'en', language: 'en' }),
        item({ dedupKey: 'en-us', language: 'en-US' }),
        item({ dedupKey: 'full', language: 'English' }),
        item({ dedupKey: 'ar', language: 'ar' }),
        item({ dedupKey: 'ar-region', language: 'ar-SA' }),
      ],
      options,
    );
    expect(result.map((i) => i.dedupKey)).toEqual(['pt', 'pt-br', 'en', 'en-us', 'full']);
  });

  it('drops non-Latin-script items (the Arabic/CJK leak) and keeps EN/PT', () => {
    const result = filterItems(
      [
        item({ dedupKey: 'arabic', title: 'نموذج DeepSeek الجديد للذكاء الاصطناعي' }),
        item({ dedupKey: 'cjk', title: 'DeepSeek 发布新模型' }),
        item({ dedupKey: 'cyrillic', title: 'Новая модель DeepSeek для разработчиков' }),
        item({ dedupKey: 'english', title: 'DeepSeek releases V3, an open-weights model' }),
        item({ dedupKey: 'model-name', title: 'GPT-4o and DeepSeek-V3 compared' }),
        item({ dedupKey: 'portuguese', title: 'Novo modelo de IA da DeepSeek é lançado' }),
      ],
      options,
    );
    expect(result.map((i) => i.dedupKey)).toEqual(['english', 'model-name', 'portuguese']);
  });

  it('skips the script gate for trusted providers (e.g. Hugging Face papers)', () => {
    const result = filterItems(
      [item({ dedupKey: 'hf', provider: 'huggingface', title: '通义千问 Qwen technical report' })],
      options,
    );
    expect(result.map((i) => i.dedupKey)).toEqual(['hf']);
  });

  it('drops non-article links (PDF, model weights, media) and keeps articles', () => {
    const result = filterItems(
      [
        item({ dedupKey: 'pdf', url: 'https://example.com/papers/deepseek.pdf' }),
        item({ dedupKey: 'weights', url: 'https://example.com/model/qwen.safetensors' }),
        item({ dedupKey: 'image', url: 'https://i.example.com/chart.png' }),
        item({ dedupKey: 'article', url: 'https://openai.com/index/new-model' }),
        item({ dedupKey: 'hn', url: 'https://news.ycombinator.com/item?id=123' }),
        item({ dedupKey: 'paper', url: 'https://huggingface.co/papers/2406.12345' }),
      ],
      options,
    );
    expect(result.map((i) => i.dedupKey)).toEqual(['article', 'hn', 'paper']);
  });
});
