import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const { decryptRuntimeContentKey, deriveLegacyRuntimeMasterKey } = await import(
  "../v2/runtime/src/runtime-key.js"
);
const encoder = new TextEncoder();
const work = mkdtempSync(join(tmpdir(), "gams-runtime-key-"));
const noname = join(work, "noname.js");
const game = join(work, "game.js");
const release = join(work, "release");
const rawMasterHex = "11".repeat(32);
writeFileSync(
  noname,
  "const u='https://gams-script-edge.2320006072.workers.dev/engine/stable.js';\n"
);
writeFileSync(game, "window.__GG_TEST_GAME__=true;\n");
const built = spawnSync("python3", [
  "v2/runtime/tools/build_release.py",
  noname,
  game,
  "9.9.9-test",
  rawMasterHex,
  release,
], { encoding: "utf8" });
assert.equal(built.status, 0, built.stderr || built.stdout);
const manifest = JSON.parse(readFileSync("/tmp/v2-runtime-unsigned.json", "utf8"));
const rawContentKey = await decryptRuntimeContentKey(manifest, {
  runtimeMasterKey: rawMasterHex,
});
assert.equal(rawContentKey.byteLength, 32);
rawContentKey.fill(0);

const legacyPassword = "legacy-release-password";
const legacyMaster = await deriveLegacyRuntimeMasterKey(legacyPassword);
const expectedContentKey = new Uint8Array(32).fill(0x5a);
const legacyIv = webcrypto.getRandomValues(new Uint8Array(12));
const legacyKey = await webcrypto.subtle.importKey(
  "raw", legacyMaster, { name: "AES-GCM" }, false, ["encrypt"]
);
const legacyCipher = new Uint8Array(await webcrypto.subtle.encrypt({
  name: "AES-GCM",
  iv: legacyIv,
  additionalData: encoder.encode("gg-v2-key|2.0.2-r1"),
  tagLength: 128,
}, legacyKey, expectedContentKey));
const legacyManifest = {
  versionName: "2.0.2-r1",
  keyIv: Buffer.from(legacyIv).toString("base64"),
  keyCipher: Buffer.from(legacyCipher).toString("base64"),
};
const migrated = await decryptRuntimeContentKey(legacyManifest, {
  runtimeMasterKey: rawMasterHex,
  legacyRuntimePassword: legacyPassword,
});
assert.deepEqual(migrated, expectedContentKey);
await assert.rejects(
  decryptRuntimeContentKey(legacyManifest, { runtimeMasterKey: rawMasterHex })
);
for (const bytes of [legacyMaster, expectedContentKey, legacyIv, legacyCipher, migrated]) {
  bytes.fill(0);
}
console.log("Runtime raw-key publication and legacy-release migration tests passed");
