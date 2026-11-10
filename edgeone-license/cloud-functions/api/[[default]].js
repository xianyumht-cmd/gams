import { getStore } from '@edgeone/pages-blob';
import { handle, toHttpError } from '../../core.mjs';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return new Response(JSON.stringify({ ok: true, service: 'gg-edgeone-internal' }),
      { headers: { ...HEADERS, 'Content-Type': 'application/json' } });
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const action = url.pathname.match(/^\/api\/(activate|check|unbind|runtime)$/)?.[1];
  if (!action) return new Response('Not found', { status: 404 });
  if (Number(request.headers.get('content-length') || 0) > 8192) {
    return new Response('Request too large', { status: 413 });
  }
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > 8192) return new Response('Request too large', { status: 413 });
    const store = getStore({ name: 'gg-private', consistency: 'strong' });
    const result = await handle(action, JSON.parse(text), { store, env });
    if (action === 'runtime') {
      const { bytes, manifest } = result;
      return new Response(bytes, { headers: {
        ...HEADERS, 'Content-Type': 'application/zip',
        'X-GG-Bundle-Sha256': manifest.sha256,
        'X-GG-Manifest': Buffer.from(JSON.stringify(manifest)).toString('base64'),
      } });
    }
    return new Response(JSON.stringify(result),
      { headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' } });
  } catch (error) {
    return toHttpError(error);
  }
}
