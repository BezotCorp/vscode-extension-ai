import { truncateText } from '../../workspace';
import { Tool, ToolAccessGuard, ToolExecutionContext, ToolExecutionResult } from '..';
import { describeContent, readStringArg } from '../tool_input';
import { toolFailure, toolSuccess } from '../tool_result';

const TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_000_000;
const SAFE_METHODS = new Set(['GET', 'HEAD']);
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
// Errors raised before any byte of the request could be delivered.
const NOT_DELIVERED_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ERR_TLS_CERT_ALTNAME_INVALID']);

type Decoding = {
  format: 'json' | 'text' | 'binary' | 'none';
  ok: boolean;
  error?: string;
};

export class WebFetchTool implements Tool {
  readonly id = 'web_fetch';
  readonly name = 'Web Fetch';
  // Even a GET can have side effects on a remote service, so this is never offered in read-only mode.
  readonly readOnlyCompatible = false;
  readonly description =
    'Sends an HTTP(S) request and returns the HTTP status, content type and body as received. Redirects are not followed: call again with the Location URL.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'http(s) URL to request.' },
      method: { type: 'string', description: 'GET (default), HEAD, POST, PUT, PATCH or DELETE.' },
      body: { type: 'string', description: 'Optional request body for POST, PUT and PATCH.' },
    },
    required: ['url'],
  };

  constructor(private readonly accessGuard: ToolAccessGuard) {}

  async execute(input: unknown, context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const rawUrl = readStringArg(input, 'url') ?? '';
    const method = (readStringArg(input, 'method') ?? 'GET').toUpperCase();
    const body = (input as { body?: unknown } | null)?.body;
    const bodyText = typeof body === 'string' ? body : undefined;
    const safe = SAFE_METHODS.has(method);
    const invalid = (reason: string, message: string) =>
      toolFailure('error', this.id, rawUrl, { reason, message, executed: false, retryable: false });

    if (!ALLOWED_METHODS.has(method)) {
      return invalid('unsupported_method', `Unsupported method: ${method}.`);
    }

    let url: URL;

    try {
      url = new URL(rawUrl);
    } catch {
      return invalid('invalid_url', `"${rawUrl}" is not a valid absolute URL.`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return invalid('unsupported_protocol', 'Only http and https URLs are supported.');
    }

    // Safe methods are scoped by domain; other operations are scoped per method and domain.
    const operationScope = safe ? url.hostname : `${method} ${url.hostname}`;
    const resource = `${method} ${url.href}`;

    await this.accessGuard.authorize(
      {
        capability: 'network',
        scope: { kind: 'domain', value: operationScope },
        grantScopes: [{ kind: 'domain', value: operationScope }],
        operation: this.id,
        detail: `${method} ${url.origin}${url.pathname}${bodyText ? `\nBody: ${describeContent(bodyText)}` : ''}`,
      },
      context?.signal,
    );

    const startedAt = Date.now();
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = context?.signal ? AbortSignal.any([context.signal, timeout]) : timeout;

    let response: Response;

    try {
      response = await fetch(url, { method, body: safe ? undefined : bodyText, redirect: 'manual', signal });
    } catch (error) {
      return this.requestFailure(error, resource, safe, context?.signal, timeout);
    }

    const received = {
      method,
      httpStatus: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type') ?? undefined,
      contentLengthHeader: response.headers.get('content-length') ?? undefined,
      ...(response.headers.get('location') && { location: response.headers.get('location') }),
    };

    let bytes: Uint8Array;
    let bodyCut: boolean;

    try {
      ({ bytes, cut: bodyCut } = method === 'HEAD' ? { bytes: new Uint8Array(), cut: false } : await readLimited(response, signal));
    } catch (error) {
      const failure = this.requestFailure(error, resource, safe, context?.signal, timeout);

      return { ...failure, reason: `body_read_${failure.reason}`, details: { ...received, ...failure.details } };
    }

    const decoded = decodeBody(bytes, received.contentType, bodyCut, method === 'HEAD');
    const truncated = truncateText(decoded.text ?? '');
    const details = {
      ...received,
      bytesRead: bytes.length,
      bodyCutAtByteLimit: bodyCut,
      decoding: decoded.decoding,
      truncatedForContext: truncated.truncated,
      durationMs: Date.now() - startedAt,
    };
    const content = decoded.text === undefined ? undefined : truncated.text;

    if (response.status >= 400) {
      const serverFault = response.status >= 500;

      return toolFailure(serverFault && !safe ? 'unknown' : 'error', this.id, resource, {
        reason: 'http_error',
        message: `The server answered HTTP ${response.status} ${response.statusText}.${serverFault && !safe ? ' Whether the server applied the request is unknown.' : ''}`,
        executed: true,
        retryable: safe && (serverFault || response.status === 429 || response.status === 408),
        content,
        details,
      });
    }

    const redirected = response.status >= 300 && response.status < 400;

    return toolSuccess(this.id, resource, {
      message: redirected ? 'Redirect not followed. Call again with the Location URL.' : undefined,
      content,
      details,
    });
  }

  private requestFailure(
    error: unknown,
    resource: string,
    safe: boolean,
    userSignal: AbortSignal | undefined,
    timeout: AbortSignal,
  ): ToolExecutionResult {
    const name = (error as { name?: string } | null)?.name;
    const cause = (error as { cause?: { code?: string; message?: string } } | null)?.cause;
    const code = cause?.code;
    const message = error instanceof Error ? error.message : String(error);

    if (userSignal?.aborted) {
      return toolFailure('cancelled', this.id, resource, {
        reason: 'cancelled_by_user',
        message: safe
          ? 'The request was cancelled.'
          : 'The request was cancelled while in flight. The server may have received and applied it.',
        executed: safe ? true : 'unknown',
        retryable: false,
      });
    }

    if (timeout.aborted || name === 'TimeoutError') {
      return toolFailure(safe ? 'error' : 'unknown', this.id, resource, {
        reason: 'timeout',
        message: safe
          ? `No complete answer within ${TIMEOUT_MS} ms.`
          : `No answer within ${TIMEOUT_MS} ms. The server may have applied the request.`,
        executed: true,
        retryable: safe,
      });
    }

    // The runtime also refuses some requests itself (for example restricted ports) before sending anything.
    const notDelivered = (code !== undefined && NOT_DELIVERED_CODES.has(code)) || cause?.message === 'bad port';

    return toolFailure(safe || notDelivered ? 'error' : 'unknown', this.id, resource, {
      reason: 'network_error',
      message: safe || notDelivered ? message : `${message}. The server may have applied the request.`,
      executed: notDelivered ? false : safe ? true : 'unknown',
      retryable: safe || notDelivered,
      details: { code, cause: cause?.message },
    });
  }
}

async function readLimited(response: Response, signal: AbortSignal): Promise<{ bytes: Uint8Array; cut: boolean }> {
  if (!response.body) {
    return { bytes: new Uint8Array(), cut: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let cut = false;

  while (true) {
    if (signal.aborted) {
      await reader.cancel().catch(() => undefined);
      throw signal.reason ?? new Error('Aborted');
    }

    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
    received += value.length;

    if (received >= MAX_BODY_BYTES) {
      cut = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  const bytes = new Uint8Array(Math.min(received, MAX_BODY_BYTES));
  let offset = 0;

  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset);

    bytes.set(part, offset);
    offset += part.length;
  }

  return { bytes, cut };
}

// Separates what was received from what could be decoded: the raw text is returned as is, and the decoding
// outcome (format, success, parse error) is reported alongside.
function decodeBody(
  bytes: Uint8Array,
  contentType: string | undefined,
  cut: boolean,
  noBody: boolean,
): { text?: string; decoding: Decoding } {
  if (noBody || bytes.length === 0) {
    return { text: noBody ? undefined : '', decoding: { format: 'none', ok: true } };
  }

  const mime = (contentType ?? '').split(';')[0].trim().toLowerCase();
  const textual =
    mime === '' ||
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('javascript') ||
    mime.includes('yaml') ||
    mime === 'application/x-www-form-urlencoded';

  if (!textual || bytes.subarray(0, 8000).includes(0)) {
    return { decoding: { format: 'binary', ok: false, error: `Body not decoded (content type: ${mime || 'unknown'}).` } };
  }

  const text = new TextDecoder(charsetOf(contentType)).decode(bytes);

  if (!mime.includes('json')) {
    return { text, decoding: { format: 'text', ok: true } };
  }

  if (cut) {
    return { text, decoding: { format: 'json', ok: false, error: 'Body cut at the size limit; JSON not parsed.' } };
  }

  try {
    JSON.parse(text);
    return { text, decoding: { format: 'json', ok: true } };
  } catch (error) {
    return { text, decoding: { format: 'json', ok: false, error: `Invalid JSON: ${(error as Error).message}` } };
  }
}

function charsetOf(contentType: string | undefined): string {
  const charset = /charset=([^;]+)/i.exec(contentType ?? '')?.[1]?.trim().replace(/["']/g, '') ?? 'utf-8';

  try {
    new TextDecoder(charset);
    return charset;
  } catch {
    return 'utf-8';
  }
}
