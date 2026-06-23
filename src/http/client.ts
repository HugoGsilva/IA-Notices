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
  ) {
    super(`HTTP ${status} ${statusText}`);
    this.name = 'HttpError';
  }
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
    return (await response.json()) as T;
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
          throw new HttpError(response.status, response.statusText);
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
