import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const license = read("license-api/src/index.js");
const runtime = read("v2/runtime/src/index.js");
const main = read("v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java");
const manager = read("v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java");
const payload = read("v2/android/client/src/main/java/com/jinli/ggsecure/RuntimePayload.java");
const secureStore = read("v2/android/client/src/main/java/com/jinli/ggsecure/SecureStore.java");
const licenseWorkflow = read(".github/workflows/deploy-license-api.yml");

for (const endpoint of ["/v1/challenge", "/v1/device/unbind", "/v1/activate", "/v1/check"]) {
  assert(license.includes(endpoint), `missing signed protocol endpoint ${endpoint}`);
}
for (const secret of ["ADMIN_LOGIN_SECRET", "TOKEN_SIGNING_SECRET"]) {
  assert(license.includes(secret), `license worker missing ${secret}`);
}
assert(!license.includes("env.ADMIN_PASSWORD"), "license worker still reuses ADMIN_PASSWORD");
assert(runtime.includes("RUNTIME_MASTER_KEY"), "runtime worker missing independent master key");
assert(runtime.includes("TOKEN_SIGNING_SECRET"), "runtime worker missing token signing key");
assert(!runtime.includes("env.ADMIN_PASSWORD"), "runtime worker still derives keys from admin password");
assert(license.includes("request.arrayBuffer()"), "license request limit is not byte based");
assert(runtime.includes("request.arrayBuffer()"), "runtime request limit is not byte based");
assert(license.includes("RETURNING count"), "license rate limiting is not atomic");
assert(runtime.includes("RETURNING count"), "runtime rate limiting is not atomic");
assert(license.includes("INSERT INTO devices") && license.includes("SELECT ?,?,?,?,?,?"),
  "device binding is not expressed as an atomic conditional insert");

assert(main.includes("MIXED_CONTENT_NEVER_ALLOW"), "mixed content is not disabled");
assert(main.includes("setAcceptThirdPartyCookies(webView, false)"),
  "third-party cookies are still enabled");
assert(!main.includes('headers.put("Access-Control-Allow-Origin", "*")'),
  "memory game response still exposes wildcard CORS");
assert(main.includes("isTrustedWebUri"), "WebView navigation lacks a host allowlist");
assert(main.includes("cancelFileChooser()"), "file chooser callback is not lifecycle managed");
assert(main.includes("URLUtil.guessFileName"), "downloads still discard trusted filenames");
assert(main.includes("webView.restoreState(savedInstanceState) == null"),
  "failed WebView state restore has no fallback");
assert(manager.includes("RuntimeResult.updateRequired(auth)"),
  "force update is not checked before runtime loading");
assert(manager.includes("URLEncoder.encode(version"), "bundle path is still trusted from server JSON");
assert(payload.includes("WipingByteArrayInputStream"), "runtime stream copy is not wiped on close");
assert(payload.includes("takeNonameSource"), "control source lifetime is not minimized");
assert(secureStore.includes("temporary_keystore_error"),
  "temporary KeyStore failures still look like permanent corruption");
assert(secureStore.includes("payload_corrupt_backup"),
  "corrupt encrypted state is not quarantined");

assert(!/\npull_request:\s*\n/.test(licenseWorkflow),
  "production license deployment still runs on pull requests");
assert(licenseWorkflow.includes("environment: production"),
  "production deployment is not protected by an environment");

console.log("Source security regression checks passed");
