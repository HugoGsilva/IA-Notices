import type { NewsItem } from '../domain/types.js';
import { hasMeaningfulNewsSignal, isSlopItem } from './relevance.js';

export interface FilterOptions {
  /** Lower bound for `publishedAt` (items without a date are kept). */
  from: Date;
  /** Preferred language (ISO 639-1). */
  language: string;
  /** Minimum score required to keep an item. */
  minScore: number;
}

/** Portuguese is allowed so PT dev/AI content is not dropped. */
const EXTRA_ALLOWED_LANGUAGES = new Set(['pt']);

/** Providers whose content is already curated to AI-specific material. */
const SCRIPT_GATE_TRUSTED = new Set(['huggingface']);

/** At least this share of an item's letters must be Latin for it to be kept. */
const MIN_LATIN_RATIO = 0.7;

/**
 * Path extensions that mark a non-article (file/binary/media) link.
 */
const NON_ARTICLE_EXT =
  /\.(pdf|docx?|pptx?|xlsx?|zip|tar|gz|tgz|7z|rar|csv|png|jpe?g|gif|webp|svg|bmp|tiff?|mp[34]|m4[av]|mov|avi|webm|wav|flac|ogg|exe|dmg|pkg|apk|gguf|safetensors|ckpt|onnx)$/i;

/**
 * Keep only relevant items:
 * - score at or above the threshold;
 * - reject obvious slop/clickbait/tutorial/listicle content;
 * - require a meaningful news/AI signal so a generic "AI" mention is not enough;
 * - published within the time window (unknown dates are kept);
 * - language compatible and predominantly Latin script;
 * - an article link, not a document/model-weight/media download.
 */
export function filterItems(items: NewsItem[], options: FilterOptions): NewsItem[] {
  const fromTime = options.from.getTime();
  const target = options.language.slice(0, 2).toLowerCase();

  return items.filter((item) => {
    if (item.score < options.minScore) return false;
    if (isSlopItem(item)) return false;
    if (!hasMeaningfulNewsSignal(item, item.categories)) return false;
    if (!withinWindow(item.publishedAt, fromTime)) return false;
    if (!languageAllowed(item.language, target)) return false;
    if (
      !SCRIPT_GATE_TRUSTED.has(item.provider) &&
      !isPredominantlyLatin(`${item.title} ${item.description ?? ''}`)
    ) {
      return false;
    }
    if (!isArticleUrl(item.url)) return false;

    return true;
  });
}

function withinWindow(publishedAt: string | null, fromTime: number): boolean {
  if (!publishedAt) return true;
  const time = Date.parse(publishedAt);
  if (Number.isNaN(time)) return true;
  return time >= fromTime;
}

function languageAllowed(language: string | null, target: string): boolean {
  if (!language) return true;
  const primary = (language.trim().split(/[-_]/)[0] ?? '').toLowerCase();
  if (/^[a-z]{2,3}$/.test(primary)) {
    const code = primary.slice(0, 2);
    return code === target || EXTRA_ALLOWED_LANGUAGES.has(code);
  }
  return true;
}

function isPredominantlyLatin(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true;
  const latin = letters.filter((char) => /\p{Script=Latin}/u.test(char)).length;
  return latin / letters.length >= MIN_LATIN_RATIO;
}

function isArticleUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return true;
  }
  if (pathname.length <= 1) return true;
  return !NON_ARTICLE_EXT.test(pathname);
}
