import type { NewsItem } from '../domain/types.js';

export interface FilterOptions {
  /** Lower bound for `publishedAt` (items without a date are kept). */
  from: Date;
  /** Preferred language (ISO 639-1). */
  language: string;
  /** Minimum score required to keep an item. */
  minScore: number;
}

/**
 * Languages accepted in addition to the target. Portuguese is allowed so PT
 * dev/AI content is not dropped; the script gate keeps the feed to these
 * Latin-script languages even when an item declares no language at all.
 */
const EXTRA_ALLOWED_LANGUAGES = new Set(['pt']);

/**
 * Providers whose items are already curated to English and may carry a
 * non-Latin author/brand token in an otherwise-English title — skip the script
 * gate for them to avoid false drops.
 */
const SCRIPT_GATE_TRUSTED = new Set(['huggingface']);

/** At least this share of an item's letters must be Latin for it to be kept. */
const MIN_LATIN_RATIO = 0.7;

/**
 * Path extensions that mark a non-article (file/binary/media) link. Matched
 * against the URL path only, anchored at the end, so query strings and dotted
 * path segments are unaffected and HTML/extension-less permalinks pass.
 */
const NON_ARTICLE_EXT =
  /\.(pdf|docx?|pptx?|xlsx?|zip|tar|gz|tgz|7z|rar|csv|png|jpe?g|gif|webp|svg|bmp|tiff?|mp[34]|m4[av]|mov|avi|webm|wav|flac|ogg|exe|dmg|pkg|apk|gguf|safetensors|ckpt|onnx)$/i;

/**
 * Keep only relevant items:
 * - score at or above the threshold (items with no keyword match score low);
 * - published within the time window (unknown dates are kept, not guessed);
 * - language compatible — English or Portuguese; unknown/unlabelled items defer
 *   to the script gate below;
 * - title/description predominantly Latin script — keeps EN/PT, drops Arabic,
 *   CJK, Cyrillic, etc. (an item with no language code that is actually Arabic
 *   only fails here, which is why this gate exists);
 * - an article link — drops PDFs, model weights, media and archive downloads.
 */
export function filterItems(items: NewsItem[], options: FilterOptions): NewsItem[] {
  const fromTime = options.from.getTime();
  const target = options.language.slice(0, 2).toLowerCase();

  return items.filter((item) => {
    if (item.score < options.minScore) return false;
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

/**
 * Is the item's declared language acceptable? Accepts the target language and
 * Portuguese by 2-letter primary subtag, so `en-US`/`pt-BR` pass while `ar-SA`
 * is dropped. Items with no code, or a non-code full name, defer to the script
 * gate (which keeps Latin-script EN/PT and drops the rest).
 */
function languageAllowed(language: string | null, target: string): boolean {
  if (!language) return true;
  const primary = (language.trim().split(/[-_]/)[0] ?? '').toLowerCase();
  if (/^[a-z]{2,3}$/.test(primary)) {
    const code = primary.slice(0, 2);
    return code === target || EXTRA_ALLOWED_LANGUAGES.has(code);
  }
  // A full name like "English" / "Português" — defer to the script gate.
  return true;
}

/** Does Latin script dominate the text? Keeps EN/PT, drops Arabic/CJK/Cyrillic. */
function isPredominantlyLatin(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true; // digits/punctuation only (e.g. "GPT-4o")
  const latin = letters.filter((char) => /\p{Script=Latin}/u.test(char)).length;
  return latin / letters.length >= MIN_LATIN_RATIO;
}

/** Is `url` an article (not a PDF/model-weight/media/archive download)? */
function isArticleUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return true; // unparseable — keep, consistent with the other allow-by-default gates
  }
  if (pathname.length <= 1) return true; // bare host / root
  return !NON_ARTICLE_EXT.test(pathname);
}
