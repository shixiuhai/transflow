/**
 * Tiny OpenAI-compatible mock used by the smoke suite to exercise 429 and slow
 * responses without touching a real provider.
 *
 *   node scripts/mock-ai.mjs
 *   POST /__control {"status":429,"delayMs":0}
 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_AI_PORT || 8126);
let state = { status: 200, delayMs: 0 };

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

function extractSegments(body) {
  try {
    const parsed = JSON.parse(body);
    const user = parsed.messages?.find((m) => m.role === 'user')?.content ?? '';
    const marker = user.lastIndexOf('Segments:');
    if (marker === -1) return [];
    const json = user.slice(marker + 'Segments:'.length).trim();
    return JSON.parse(json);
  } catch {
    return [];
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/__control') {
    const body = await readBody(req);
    state = { ...state, ...JSON.parse(body || '{}') };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }

  if (req.method === 'POST' && req.url?.startsWith('/v1/chat/completions')) {
    const body = await readBody(req);
    await new Promise((r) => setTimeout(r, state.delayMs));
    if (state.status !== 200) {
      res.writeHead(state.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `mock status ${state.status}` } }));
      return;
    }
    const segments = extractSegments(body);
    const payload = {
      translations: segments.map((segment) => ({ id: String(segment.id), text: `〔AI 模拟〕${segment.text}` })),
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock-ai listening on http://127.0.0.1:${PORT}`);
});
