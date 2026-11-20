import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));
vi.mock('../../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

import { PermissionError } from '../../../permissions';
import { MAX_FILE_CHARS } from '../../../workspace';
import type { ToolAccessGuard } from '../../tool_access_guard';
import { MAX_BODY_BYTES } from '../web_fetch_limits';
import { WebFetchTool } from '../web_fetch_tool';

const guard = { authorize: vi.fn(async (..._args: unknown[]) => undefined) };
const fetchMock = vi.fn();
const tool = () => new WebFetchTool(guard as unknown as ToolAccessGuard);
const request = () =>
  guard.authorize.mock.calls[0]?.[0] as {
    action: string;
    actionLabel: string;
    effects: string[];
    detail: string;
    warning?: string;
  };

function respond(body: BodyInit | null, init: ResponseInit & { headers?: Record<string, string> } = {}): void {
  fetchMock.mockResolvedValueOnce(new Response(body, init));
}

function networkError(code: string, message = 'fetch failed'): Error {
  return Object.assign(new Error(message), { cause: { code, message: code } });
}

describe('WebFetchTool', () => {
  beforeEach(() => {
    guard.authorize.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('what it refuses before asking', () => {
    it('refuses a method it does not support', async () => {
      expect(await tool().execute({ url: 'https://example.com', method: 'TRACE' })).toMatchObject({
        reason: 'unsupported_method',
        executed: false,
        retryable: false,
      });
    });

    it('refuses a URL that is not absolute', async () => {
      expect(await tool().execute({ url: 'example.com/path' })).toMatchObject({ reason: 'invalid_url' });
      expect(await tool().execute({})).toMatchObject({ reason: 'invalid_url' });
    });

    it('refuses a protocol other than http and https', async () => {
      for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'data:text/plain,hi', 'javascript:alert(1)']) {
        expect(await tool().execute({ url })).toMatchObject({ reason: 'unsupported_protocol' });
      }

      expect(guard.authorize).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('the permission it asks for', () => {
    beforeEach(() => respond('ok', { headers: { 'content-type': 'text/plain' } }));

    it('names the method and the host, and covers every method to that host when refused', async () => {
      await tool().execute({ url: 'https://Example.COM/a/b?token=secret', method: 'get' });

      expect(request().action).toBe('send a GET request to example.com');
      expect(request().effects).toEqual(['net:example.com']);
      expect(request().detail).toBe('GET https://example.com/a/b');
    });

    it('does not show the query string in the dialog', async () => {
      await tool().execute({ url: 'https://example.com/a?token=secret' });

      expect(request().detail).not.toContain('secret');
    });

    it('describes the body of a request that has one', async () => {
      await tool().execute({ url: 'https://example.com', method: 'POST', body: 'hello' });

      expect(request().detail).toContain('detail.body');
      expect(request().detail).toContain('hello');
    });

    it('warns about local and private addresses, and only about those', async () => {
      const warned = async (url: string) => {
        guard.authorize.mockClear();
        respond('ok');
        await tool().execute({ url });

        return request().warning !== undefined;
      };

      for (const url of [
        'http://localhost:3000',
        'http://app.localhost',
        'http://printer.local',
        'http://db.internal',
        'http://127.0.0.1',
        'http://0.0.0.0',
        'http://10.1.2.3',
        'http://169.254.169.254/latest/meta-data',
        'http://172.16.0.1',
        'http://172.31.255.1',
        'http://192.168.1.1',
        'http://[::1]:8080',
        'http://[fd12:3456::1]',
        'http://[fe80::1]',
      ]) {
        expect(await warned(url), url).toBe(true);
      }

      for (const url of [
        'https://example.com',
        'http://172.32.0.1',
        'http://172.15.0.1',
        'http://8.8.8.8',
        'http://fcdn.example.com',
        'http://192.169.0.1',
      ]) {
        expect(await warned(url), url).toBe(false);
      }
    });

    it('sends nothing when the guard refuses', async () => {
      guard.authorize.mockRejectedValueOnce(new PermissionError('user_refused', 'user_refused', 'no'));

      await expect(tool().execute({ url: 'https://example.com' })).rejects.toBeInstanceOf(PermissionError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('what it sends', () => {
    it('sends a GET without following redirects, and without a body', async () => {
      respond('ok');

      await tool().execute({ url: 'https://example.com/x', body: 'ignored' });

      const [url, options] = fetchMock.mock.calls[0] ?? [];

      expect(String(url)).toBe('https://example.com/x');
      expect(options).toMatchObject({ method: 'GET', redirect: 'manual', body: undefined });
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('sends the body of a POST, PUT or PATCH, and none for a HEAD', async () => {
      for (const method of ['POST', 'PUT', 'PATCH']) {
        respond('ok');
        await tool().execute({ url: 'https://example.com', method, body: 'data' });
        expect(fetchMock.mock.calls.at(-1)?.[1]).toMatchObject({ method, body: 'data' });
      }

      respond(null);
      await tool().execute({ url: 'https://example.com', method: 'HEAD', body: 'data' });
      expect(fetchMock.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'HEAD', body: undefined });
    });

    it('stops the request when the model request is cancelled', async () => {
      respond('ok');

      const controller = new AbortController();

      await tool().execute({ url: 'https://example.com' }, { signal: controller.signal });
      controller.abort();

      expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true);
    });
  });

  describe('what it returns', () => {
    it('returns the status, the content type and the body as received', async () => {
      respond('hello', { status: 200, statusText: 'OK', headers: { 'content-type': 'text/plain; charset=utf-8' } });

      const result = await tool().execute({ url: 'https://example.com' });

      expect(result).toMatchObject({
        status: 'success',
        resource: 'GET https://example.com/',
        content: 'hello',
        details: {
          httpStatus: 200,
          contentType: 'text/plain; charset=utf-8',
          bytesRead: 5,
          bodyCutAtByteLimit: false,
          decoding: { format: 'text', ok: true },
          truncatedForContext: false,
        },
      });
    });

    it('checks that a JSON body parses, and reports the error otherwise, keeping the text', async () => {
      respond('{"a":1}', { headers: { 'content-type': 'application/json' } });
      expect((await tool().execute({ url: 'https://example.com' })).details?.decoding).toEqual({
        format: 'json',
        ok: true,
      });

      respond('{"a":', { headers: { 'content-type': 'application/json' } });

      const broken = await tool().execute({ url: 'https://example.com' });

      expect(broken.content).toBe('{"a":');
      expect((broken.details?.decoding as { ok: boolean; error: string } | undefined)?.ok).toBe(false);
      expect((broken.details?.decoding as { error: string } | undefined)?.error).toContain('Invalid JSON');
    });

    it('does not decode a binary body, and says so', async () => {
      respond(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]), { headers: { 'content-type': 'image/png' } });

      const result = await tool().execute({ url: 'https://example.com/a.png' });

      expect(result.content).toBeUndefined();
      expect(result.details?.decoding).toEqual({
        format: 'binary',
        ok: false,
        error: 'Body not decoded (content type: image/png).',
      });
    });

    it('treats a body with a null byte as binary even under a text type', async () => {
      respond(new Uint8Array([0x61, 0x00, 0x62]), { headers: { 'content-type': 'text/plain' } });

      expect((await tool().execute({ url: 'https://example.com' })).details?.decoding).toMatchObject({
        format: 'binary',
      });
    });

    it('treats a body with no content type as text, and an empty body as empty', async () => {
      respond('plain');
      expect((await tool().execute({ url: 'https://example.com' })).content).toBe('plain');

      respond('', { headers: { 'content-type': 'text/plain' } });
      expect(await tool().execute({ url: 'https://example.com' })).toMatchObject({
        content: '',
        details: { decoding: { format: 'none', ok: true } },
      });
    });

    it('decodes the charset the server announces, and falls back on utf-8 for one it does not know', async () => {
      respond(new Uint8Array([0xe9]), { headers: { 'content-type': 'text/plain; charset="iso-8859-1"' } });
      expect((await tool().execute({ url: 'https://example.com' })).content).toBe('é');

      respond('ok', { headers: { 'content-type': 'text/plain; charset=nonsense' } });
      expect((await tool().execute({ url: 'https://example.com' })).content).toBe('ok');
    });

    it('returns no body for a HEAD, but its headers', async () => {
      respond(null, { headers: { 'content-length': '42', 'content-type': 'text/html' } });

      const result = await tool().execute({ url: 'https://example.com', method: 'HEAD' });

      expect(result.content).toBeUndefined();
      expect(result.details).toMatchObject({ contentLengthHeader: '42', decoding: { format: 'none' } });
    });

    it('does not follow a redirect, and reports where it leads', async () => {
      respond(null, { status: 302, headers: { location: 'https://example.com/next' } });

      const result = await tool().execute({ url: 'https://example.com' });

      expect(result).toMatchObject({
        status: 'success',
        message: 'Redirect not followed. Call again with the Location URL.',
        details: { httpStatus: 302, location: 'https://example.com/next' },
      });
    });

    it('cuts a body at the size limit, and does not parse a JSON that was cut', async () => {
      respond(`{"a":"${'x'.repeat(MAX_BODY_BYTES + 100)}"}`, { headers: { 'content-type': 'application/json' } });

      const result = await tool().execute({ url: 'https://example.com' });

      expect(result.details).toMatchObject({ bytesRead: MAX_BODY_BYTES, bodyCutAtByteLimit: true });
      expect(result.details?.decoding).toEqual({
        format: 'json',
        ok: false,
        error: 'Body cut at the size limit; JSON not parsed.',
      });
    });

    it('cuts a long text for the context and says so', async () => {
      respond('y'.repeat(MAX_FILE_CHARS + 100), { headers: { 'content-type': 'text/plain' } });

      const result = await tool().execute({ url: 'https://example.com' });

      expect(result.details?.truncatedForContext).toBe(true);
      expect(result.content).toContain('Content truncated');
    });
  });

  describe('an HTTP error', () => {
    it('is an error with the body, not retryable for a client error', async () => {
      respond('missing', { status: 404, statusText: 'Not Found', headers: { 'content-type': 'text/plain' } });

      expect(await tool().execute({ url: 'https://example.com' })).toMatchObject({
        status: 'error',
        reason: 'http_error',
        executed: true,
        retryable: false,
        content: 'missing',
      });
    });

    it('may be retried for a read when the server failed, was busy, or timed out', async () => {
      for (const status of [500, 503, 429, 408]) {
        respond('', { status });
        expect((await tool().execute({ url: 'https://example.com' })).retryable, String(status)).toBe(true);
      }

      respond('', { status: 403 });
      expect((await tool().execute({ url: 'https://example.com' })).retryable).toBe(false);
    });

    it('leaves the outcome unknown when a request that changes things got a server error', async () => {
      respond('', { status: 500 });

      const result = await tool().execute({ url: 'https://example.com', method: 'POST', body: 'x' });

      expect(result).toMatchObject({ status: 'unknown', retryable: false });
      expect(result.message).toContain('Whether the server applied the request is unknown.');
    });

    it('is a plain error when a request that changes things got a client error', async () => {
      respond('', { status: 400 });

      expect(await tool().execute({ url: 'https://example.com', method: 'POST', body: 'x' })).toMatchObject({
        status: 'error',
      });
    });
  });

  describe('when the request itself fails', () => {
    it('reports a network error for a read, which may be retried', async () => {
      fetchMock.mockRejectedValueOnce(networkError('ECONNRESET', 'socket hang up'));

      expect(await tool().execute({ url: 'https://example.com' })).toMatchObject({
        status: 'error',
        reason: 'network_error',
        executed: true,
        retryable: true,
        details: { code: 'ECONNRESET' },
      });
    });

    it('knows a request that changes things never left when the connection could not be made', async () => {
      for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
        fetchMock.mockRejectedValueOnce(networkError(code));

        expect(await tool().execute({ url: 'https://example.com', method: 'POST' }), code).toMatchObject({
          status: 'error',
          executed: false,
          retryable: true,
        });
      }
    });

    it('knows a request the runtime refused itself, such as a restricted port, was not sent', async () => {
      fetchMock.mockRejectedValueOnce(Object.assign(new Error('fetch failed'), { cause: { message: 'bad port' } }));

      expect(await tool().execute({ url: 'http://example.com:6000', method: 'DELETE' })).toMatchObject({
        status: 'error',
        executed: false,
      });
    });

    it('leaves the outcome unknown when a request that changes things failed in flight', async () => {
      fetchMock.mockRejectedValueOnce(networkError('ECONNRESET', 'reset'));

      const result = await tool().execute({ url: 'https://example.com', method: 'PUT', body: 'x' });

      expect(result).toMatchObject({ status: 'unknown', executed: 'unknown', retryable: false });
      expect(result.message).toContain('The server may have applied the request.');
    });

    it('reports a timeout, retryable for a read and uncertain for a write', async () => {
      const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });

      fetchMock.mockRejectedValueOnce(timeout);
      expect(await tool().execute({ url: 'https://example.com' })).toMatchObject({
        status: 'error',
        reason: 'timeout',
        retryable: true,
      });

      fetchMock.mockRejectedValueOnce(timeout);
      expect(await tool().execute({ url: 'https://example.com', method: 'POST' })).toMatchObject({
        status: 'unknown',
        reason: 'timeout',
        retryable: false,
      });
    });

    it('reports a cancellation by the user, uncertain for a write', async () => {
      const controller = new AbortController();

      controller.abort();
      fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      expect(await tool().execute({ url: 'https://example.com' }, { signal: controller.signal })).toMatchObject({
        status: 'cancelled',
        reason: 'cancelled_by_user',
        executed: true,
      });
      expect(
        await tool().execute({ url: 'https://example.com', method: 'POST' }, { signal: controller.signal }),
      ).toMatchObject({ status: 'cancelled', executed: 'unknown' });
    });

    it('reports a failure while the body was being read, with what had been received', async () => {
      const failing = new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.error(networkError('ECONNRESET', 'body reset'));
        },
      });

      respond(failing, { status: 200, headers: { 'content-type': 'text/plain' } });

      const result = await tool().execute({ url: 'https://example.com' });

      expect(result).toMatchObject({ status: 'error', reason: 'body_read_network_error' });
      expect(result.details).toMatchObject({ httpStatus: 200, contentType: 'text/plain' });
    });
  });
});
