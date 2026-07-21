from pathlib import Path

path = Path("src/index.js")
text = path.read_text(encoding="utf-8")
text = text.replace("latestAppVersion: 7,", "latestAppVersion: 8,", 1)

route_marker = '      if (request.method === "POST" && url.pathname === "/v1/challenge") return issueChallenge(request, env);\n'
route = '      if (request.method === "POST" && url.pathname === "/v1/client/config") return clientConfig(request, env);\n'
if route not in text:
    if route_marker not in text:
        raise SystemExit("Missing client configuration route marker")
    text = text.replace(route_marker, route + route_marker, 1)

function_marker = "async function issueChallenge(request, env) {"
function = '''async function clientConfig(request, env) {
  const settings = await loadSettings(env);
  let appVersion = 0;
  try { appVersion = appVersionOf(await readJson(request)); } catch { appVersion = 0; }
  const updateRequired = appVersion > 0 && (appVersion < settings.minAppVersion ||
    (settings.forceUpdate && appVersion < settings.latestAppVersion));
  return reply({
    ok: true,
    configVersion: settings.configVersion,
    minAppVersion: settings.minAppVersion,
    latestAppVersion: settings.latestAppVersion,
    forceUpdate: settings.forceUpdate,
    updateRequired,
    updateUrl: settings.updateUrl,
    updateMessage: settings.updateMessage,
    serverTime: nowSeconds(),
  });
}

'''
if "async function clientConfig(" not in text:
    if function_marker not in text:
        raise SystemExit("Missing client configuration function marker")
    text = text.replace(function_marker, function + function_marker, 1)

path.write_text(text, encoding="utf-8")
print("Added public GG update metadata endpoint")
