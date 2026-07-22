#!/usr/bin/env python3
import base64
import hashlib
import json
import os
import secrets
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

if len(sys.argv) != 6:
    raise SystemExit(
        "usage: build_release.py <noname.js> <game.js> <version> <password> <output-dir>"
    )

noname_path = Path(sys.argv[1])
game_path = Path(sys.argv[2])
version = sys.argv[3].strip()
password = sys.argv[4]
output = Path(sys.argv[5])
if not version or not password:
    raise SystemExit("version and password are required")

noname = noname_path.read_bytes()
game = game_path.read_bytes()
virtual_url = b"https://ggv2.local/runtime/game.js"
old_urls = [
    b"https://gams-script-edge.2320006072.workers.dev/engine/stable.js",
    b"https://preview-chat-1b176371-f9ab-4760-b15c-b9d70ed59d23.space-z.ai/game.js",
]
patched = noname
for old in old_urls:
    patched = patched.replace(old, virtual_url)
if virtual_url not in patched:
    raise SystemExit("noname.js engine URL was not rewritten to the V2 virtual route")
for old in old_urls:
    if old in patched:
        raise SystemExit(f"legacy engine URL remains in patched noname.js: {old!r}")

output.mkdir(parents=True, exist_ok=True)
plain_zip = output / ".runtime.zip"
with zipfile.ZipFile(plain_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    archive.writestr("noname.js", patched)
    archive.writestr("game.js", game)

plain = bytearray(plain_zip.read_bytes())
plain_zip.unlink()
content_key = bytearray(secrets.token_bytes(32))
bundle_iv = secrets.token_bytes(12)
bundle_aad = f"gg-v2-runtime|{version}".encode()
encrypted_bundle = AESGCM(bytes(content_key)).encrypt(bundle_iv, bytes(plain), bundle_aad)

master_key = hashlib.sha256(
    f"gg-v2-runtime-master:{password}".encode()
).digest()
key_iv = secrets.token_bytes(12)
key_aad = f"gg-v2-key|{version}".encode()
key_cipher = AESGCM(master_key).encrypt(key_iv, bytes(content_key), key_aad)

filename = f"bundle-{version}.bin"
bundle_path = output / filename
bundle_path.write_bytes(encrypted_bundle)

published_at = (
    datetime.now(timezone.utc)
    .replace(microsecond=0)
    .isoformat()
    .replace("+00:00", "Z")
)
manifest = {
    "schemaVersion": 2,
    "versionName": version,
    "file": filename,
    "size": len(encrypted_bundle),
    "sha256": hashlib.sha256(encrypted_bundle).hexdigest(),
    "iv": base64.b64encode(bundle_iv).decode(),
    "nonameSize": len(patched),
    "nonameSha256": hashlib.sha256(patched).hexdigest(),
    "gameSize": len(game),
    "gameSha256": hashlib.sha256(game).hexdigest(),
    "keyIv": base64.b64encode(key_iv).decode(),
    "keyCipher": base64.b64encode(key_cipher).decode(),
    "publishedAt": published_at,
}
keys = (
    "schemaVersion", "versionName", "file", "size", "sha256", "iv",
    "nonameSize", "nonameSha256", "gameSize", "gameSha256",
    "keyIv", "keyCipher", "publishedAt",
)
canonical = "".join(f"{key}={manifest[key]}\n" for key in keys)
Path("/tmp/v2-runtime-canonical.txt").write_text(
    canonical, encoding="utf-8", newline="\n"
)
Path("/tmp/v2-runtime-unsigned.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
for index in range(len(content_key)):
    content_key[index] = 0
for index in range(len(plain)):
    plain[index] = 0
print(json.dumps({
    "version": version,
    "file": filename,
    "size": manifest["size"],
    "sha256": manifest["sha256"],
    "nonameSize": manifest["nonameSize"],
    "gameSize": manifest["gameSize"],
}))
