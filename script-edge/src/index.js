const SCRIPT_RELEASE_BASE = "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/remote-script/release/";
const ENGINE_RELEASE_BASE = "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/game-engine/release/";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function fetchUpstream(base, filename, method, ttl) {
  return fetch(base + encodeURIComponent(filename), {
    method,
    headers: { "user-agent": "gams-script-edge/2.0" },
    cf: { cacheEverything: true, cacheTtl: ttl },
  });
}

function responseHeaders(upstream, contentType, cacheControl) {
  const headers = new Headers(upstream.headers);
  headers.set("content-type", contentType);
  headers.set("cache-control", cacheControl);
  headers.set("x-content-type-options", "nosniff");
  headers.set("access-control-allow-origin", "*");
  return headers;
}

async function proxyVersioned(base, filename, request, isManifest = false) {
  const upstream = await fetchUpstream(base, filename, request.method, isManifest ? 60 : 31536000);
  if (!upstream.ok) {
    return json({ ok: false, error: "upstream_unavailable", status: upstream.status }, 502);
  }
  const headers = responseHeaders(
    upstream,
    isManifest ? "application/json; charset=utf-8" : "text/javascript; charset=utf-8",
    isManifest ? "public, max-age=30, s-maxage=60" : "public, max-age=31536000, immutable",
  );
  return new Response(upstream.body, { status: 200, headers });
}

async function stableEngine(request) {
  const manifestResponse = await fetchUpstream(ENGINE_RELEASE_BASE, "manifest.json", "GET", 60);
  if (!manifestResponse.ok) {
    return json({ ok: false, error: "engine_manifest_unavailable", status: manifestResponse.status }, 502);
  }
  let manifest;
  try {
    manifest = await manifestResponse.json();
  } catch {
    return json({ ok: false, error: "engine_manifest_invalid" }, 502);
  }
  const filename = String(manifest.file || "");
  if (!/^game-[A-Za-z0-9._-]+\.js$/.test(filename)) {
    return json({ ok: false, error: "engine_filename_invalid" }, 502);
  }
  const upstream = await fetchUpstream(ENGINE_RELEASE_BASE, filename, request.method, 31536000);
  if (!upstream.ok) {
    return json({ ok: false, error: "engine_unavailable", status: upstream.status }, 502);
  }
  const headers = responseHeaders(upstream, "text/javascript; charset=utf-8", "public, max-age=30, s-maxage=60");
  headers.set("x-engine-version", String(manifest.versionName || "unknown"));
  headers.set("x-engine-sha256", String(manifest.sha256 || ""));
  return new Response(upstream.body, { status: 200, headers });
}

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "signed-script-edge", engineHosting: true });
    }
    const scriptMatch = url.pathname.match(/^\/release\/(manifest\.json|noname-[A-Za-z0-9._-]+\.js)$/);
    if (scriptMatch) {
      const filename = scriptMatch[1];
      return proxyVersioned(SCRIPT_RELEASE_BASE, filename, request, filename === "manifest.json");
    }
    if (url.pathname === "/engine/stable.js") return stableEngine(request);
    const engineMatch = url.pathname.match(/^\/engine\/(manifest\.json|game-[A-Za-z0-9._-]+\.js)$/);
    if (engineMatch) {
      const filename = engineMatch[1];
      return proxyVersioned(ENGINE_RELEASE_BASE, filename, request, filename === "manifest.json");
    }
    return json({ ok: false, error: "not_found" }, 404);
  },
};
