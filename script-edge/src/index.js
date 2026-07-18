const RELEASE_BASE = "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/remote-script/release/";

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

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "signed-script-edge" });
    }

    const match = url.pathname.match(/^\/release\/(manifest\.json|noname-[A-Za-z0-9._-]+\.js)$/);
    if (!match) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    const filename = match[1];
    const upstreamUrl = RELEASE_BASE + encodeURIComponent(filename);
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: { "user-agent": "gams-script-edge/1.0" },
      cf: {
        cacheEverything: true,
        cacheTtl: filename === "manifest.json" ? 60 : 31536000,
      },
    });

    if (!upstream.ok) {
      return json({ ok: false, error: "upstream_unavailable", status: upstream.status }, 502);
    }

    const headers = new Headers(upstream.headers);
    headers.set(
      "content-type",
      filename === "manifest.json"
        ? "application/json; charset=utf-8"
        : "text/javascript; charset=utf-8",
    );
    headers.set(
      "cache-control",
      filename === "manifest.json"
        ? "public, max-age=30, s-maxage=60"
        : "public, max-age=31536000, immutable",
    );
    headers.set("x-content-type-options", "nosniff");
    headers.set("access-control-allow-origin", "*");

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  },
};
