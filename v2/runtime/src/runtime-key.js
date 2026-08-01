const encoder = new TextEncoder();

export function decodeRuntimeMasterKey(value) {
  const text = String(value || "").trim();
  let bytes;
  if (/^[0-9a-fA-F]{64}$/.test(text)) {
    bytes = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
      bytes[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16);
    }
  } else {
    const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
    bytes = decodeBase64(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  }
  if (bytes.byteLength !== 32) {
    bytes.fill(0);
    throw new Error("RUNTIME_MASTER_KEY must decode to exactly 32 bytes");
  }
  return bytes;
}

export async function deriveLegacyRuntimeMasterKey(password) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`gg-v2-runtime-master:${String(password || "")}`)
  );
  return new Uint8Array(digest);
}

export async function decryptRuntimeContentKey(
  manifest,
  { runtimeMasterKey, legacyRuntimePassword = "" }
) {
  const primary = decodeRuntimeMasterKey(runtimeMasterKey);
  try {
    return await decryptWithMasterKey(manifest, primary);
  } catch (primaryError) {
    if (!legacyRuntimePassword) throw primaryError;
    const legacy = await deriveLegacyRuntimeMasterKey(legacyRuntimePassword);
    try {
      return await decryptWithMasterKey(manifest, legacy);
    } finally {
      legacy.fill(0);
    }
  } finally {
    primary.fill(0);
  }
}

async function decryptWithMasterKey(manifest, masterBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    masterBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const iv = decodeBase64(manifest.keyIv);
  const cipher = decodeBase64(manifest.keyCipher);
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: encoder.encode(`gg-v2-key|${manifest.versionName}`),
        tagLength: 128,
      },
      key,
      cipher
    );
    const bytes = new Uint8Array(plain);
    if (bytes.byteLength !== 32) {
      bytes.fill(0);
      throw new Error("runtime content key must contain exactly 32 bytes");
    }
    return bytes;
  } finally {
    iv.fill(0);
    cipher.fill(0);
  }
}

function decodeBase64(value) {
  const binary = atob(String(value || ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
