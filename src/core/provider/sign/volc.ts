/**
 * Volcengine V4 request signing (HMAC-SHA256), implemented with WebCrypto so it
 * works in an MV3 service worker.
 *
 * Reference: https://www.volcengine.com/docs/6369/67269
 * Host = translate.volcengineapi.com
 * QueryString = Action=TranslateText&Version=2020-06-01
 * Region = cn-north-1, Service = translate
 */

export interface VolcCredentials {
  accessKey: string;
  secretKey: string;
}

export interface VolcSignOptions {
  method?: string;
  host: string;
  path?: string;
  query: Record<string, string>;
  body: string;
  credentials: VolcCredentials;
  region: string;
  service: string;
  /** Injectable for deterministic tests. */
  date?: Date;
}

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export async function sha256Hex(data: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256(key: Uint8Array<ArrayBuffer>, message: string): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return new Uint8Array(signature);
}

/** RFC 3986 encoding, matching the Volcengine/AWS canonicalization rules. */
export function uriEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '%20');
}

export function formatXDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function canonicalQuery(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k] ?? '')}`)
    .join('&');
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export interface SignedHeaders {
  headers: Record<string, string>;
  authorization: string;
  xDate: string;
  payloadHash: string;
  canonicalRequest: string;
}

export async function signVolcRequest(opts: VolcSignOptions): Promise<SignedHeaders> {
  const method = opts.method ?? 'POST';
  const path = opts.path ?? '/';
  const date = opts.date ?? new Date();
  const xDate = formatXDate(date);
  const shortDate = xDate.slice(0, 8);
  const payloadHash = await sha256Hex(opts.body);

  // Volcengine's official SDK signs only these two headers for OpenAPI JSON
  // requests (content-type and host are deliberately unsigned).
  const headersToSign: Record<string, string> = {
    'x-content-sha256': payloadHash,
    'x-date': xDate,
  };

  const signedHeaderNames = Object.keys(headersToSign).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${normalizeHeaderValue(headersToSign[name] ?? '')}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    method,
    path,
    canonicalQuery(opts.query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${shortDate}/${opts.region}/${opts.service}/request`;
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmacSha256(encoder.encode(opts.credentials.secretKey), shortDate);
  const kRegion = await hmacSha256(kDate, opts.region);
  const kService = await hmacSha256(kRegion, opts.service);
  const kSigning = await hmacSha256(kService, 'request');
  const signature = bytesToHex(await hmacSha256(kSigning, stringToSign));

  const authorization = `HMAC-SHA256 Credential=${opts.credentials.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    headers: {
      'Content-Type': 'application/json',
      'X-Date': xDate,
      'X-Content-Sha256': payloadHash,
      Authorization: authorization,
    },
    authorization,
    xDate,
    payloadHash,
    canonicalRequest,
  };
}
