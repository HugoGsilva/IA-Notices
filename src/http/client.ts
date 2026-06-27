/**
 * Shared HTTP client used by every provider and the Discord notifier.
 *
 * Built on the native `fetch` (Node 20+) so no extra dependency is needed.
 * Adds a request timeout (via `AbortController`) and bounded retries with
 * exponential backoff. Never logs credentials: callers should pass already
 * masked URLs to logs, and `maskUrl` is provided for that purpose.
 */

export interface HttpClientOptions {
  /** Per-attempt timeout in milliseconds. */
  timeoutMs: number;
  /** Number of retries after the first attempt (0 = no retry). */
  retries: number;
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Already-serialised request body (e.g. JSON string). */
  body?: string;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    /** Best-effort, truncated response body to aid diagnosis (never secrets). */
    readonly body?: string,
  ) {
    super(`HTTP ${status} ${statusText}${body ? `: ${body}` : ''}`);
    this.name = 'HttpError';
  }
}

/** Collapse whitespace and truncate a body so it is safe/short to log. */
function snippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Remove credentials and querystring from a URL so it is safe to log.
 * Returns a best-effort masked string; never throws on malformed input.
 */
export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const query = parsed.search ? '?<redacted>' : '';
    return `${parsed.origin}${parsed.pathname}${query}`;
  } catch {
    return '<invalid-url>';
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry only transient failures: network errors, timeouts and 5xx/429. */
function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status >= 500 || error.status === 429;
  }
  // Network failure or AbortError (timeout) — worth retrying.
  return true;
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  /** Perform a request and return the parsed JSON body. */
  async getJson<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    const response = await this.request(url, options);
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      // Some APIs answer 200 with a plain-text error page (e.g. GDELT). Surface
      // it instead of an opaque "Unexpected token" parse error.
      throw new Error(`Invalid JSON from ${maskUrl(url)}: ${snippet(text)}`);
    }
  }

  /** Perform a request with timeout + retries. Throws `HttpError` on non-2xx. */
  async request(url: string, options: HttpRequestOptions = {}): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
      try {
        const response = await fetch(url, {
          method: options.method ?? 'GET',
          headers: options.headers,
          body: options.body,
          signal: controller.signal,
        });
        if (!response.ok) {
          // Capture a short body snippet so 4xx causes (e.g. an invalid query
          // parameter) are visible in logs instead of a bare status code.
          let body: string | undefined;
          try {
            body = snippet(await response.text());
          } catch {
            body = undefined;
          }
          throw new HttpError(response.status, response.statusText, body);
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt === this.options.retries || !isRetryable(error)) {
          break;
        }
        // Exponential backoff: 200ms, 400ms, 800ms, ...
        await sleep(200 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError;
  }
}
