import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient, HttpError, maskUrl } from '../../src/http/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const jsonResponse = (body: unknown, init: { status?: number } = {}): Response =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });

describe('maskUrl', () => {
  it('strips credentials and querystring', () => {
    expect(maskUrl('https://user:pass@example.com/path?apiKey=secret')).toBe(
      'https://example.com/path?<redacted>',
    );
  });

  it('returns a placeholder for malformed input', () => {
    expect(maskUrl('not a url')).toBe('<invalid-url>');
  });
});

describe('HttpClient', () => {
  it('returns parsed JSON on success', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
    const client = new HttpClient({ timeoutMs: 1000, retries: 0 });

    await expect(client.getJson('https://example.com')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries on a 5xx then succeeds', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new HttpClient({ timeoutMs: 1000, retries: 2 });

    await expect(client.getJson('https://example.com')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a 4xx and throws HttpError', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({}, { status: 404 }));
    const client = new HttpClient({ timeoutMs: 1000, retries: 3 });

    await expect(client.request('https://example.com')).rejects.toBeInstanceOf(HttpError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts on timeout and retries network failures', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new HttpClient({ timeoutMs: 1000, retries: 1 });

    await expect(client.getJson('https://example.com')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('still down'));
    const client = new HttpClient({ timeoutMs: 1000, retries: 1 });

    await expect(client.request('https://example.com')).rejects.toThrow(/still down/);
  });
});
