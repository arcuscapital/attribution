// Optional server-to-server access for Arcus. Standalone password access is unchanged.
const ASSETS = new Set(['index.html','style.css','app.mjs','session.mjs','worker.mjs','engine.mjs','ranges.mjs']);
export async function bridgeAsset(request, env, now = Date.now()) {
  const path = new URL(request.url).pathname;
  const asset = path.slice('/arcus-bridge/'.length);
  if (!path.startsWith('/arcus-bridge/') || !ASSETS.has(asset) || !['GET','HEAD'].includes(request.method) || !env.ANALYSIS_BRIDGE_KEY) return null;
  const timestamp = request.headers.get('X-Arcus-Time') || '';
  const signature = request.headers.get('X-Arcus-Signature') || '';
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const age = Math.floor(now/1000) - Number(timestamp);
  if (age < -5 || age > 30) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.ANALYSIS_BRIDGE_KEY), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  const payload = `arcus-attribution:v1\n${request.method}\n${path}\n${timestamp}`;
  const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(signature.match(/../g), h=>parseInt(h,16)), encoder.encode(payload));
  return valid ? asset : null;
}
