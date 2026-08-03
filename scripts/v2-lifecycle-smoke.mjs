import { createHash, randomBytes, webcrypto } from "node:crypto";

const { subtle } = webcrypto;
const encoder = new TextEncoder();
const licenseEndpoint = required("LICENSE_ENDPOINT").replace(/\/$/, "");
const runtimeEndpoint = required("RUNTIME_ENDPOINT").replace(/\/$/, "");
const adminPassword = required("ADMIN_LOGIN_SECRET");
const appVersion = 11;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function base64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function requestJson(url, options = {}, expected = [200]) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${url} returned non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!expected.includes(response.status)) {
    throw new Error(`${url} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return { response, body };
}

async function postJson(url, body, headers = {}, expected = [200]) {
  return requestJson(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }, expected);
}

async function createDevice(name) {
  const keyPair = await subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicBytes = new Uint8Array(await subtle.exportKey("spki", keyPair.publicKey));
  return {
    name,
    keyPair,
    publicKey: base64(publicBytes),
    keyFingerprint: sha256Hex(publicBytes),
    certificateDigest: sha256Hex(`ci-certificate:${name}`),
    deviceId: sha256Hex(`ci-device:${name}:${randomBytes(16).toString("hex")}`),
  };
}

async function signedBody(endpoint, device, purpose, payloadHash, extra = {}) {
  const { body: challenge } = await postJson(`${endpoint}/v1/challenge`, {
    deviceId: device.deviceId,
    purpose,
    appVersion,
  });
  const canonical = [
    purpose,
    challenge.nonce,
    String(challenge.serverTime),
    device.deviceId,
    device.keyFingerprint,
    String(appVersion),
    device.certificateDigest,
    payloadHash,
  ].join("\n");
  const signature = new Uint8Array(await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    device.keyPair.privateKey,
    encoder.encode(canonical)
  ));
  return {
    purpose,
    nonce: challenge.nonce,
    timestamp: challenge.serverTime,
    deviceId: device.deviceId,
    keyFingerprint: device.keyFingerprint,
    certificateDigest: device.certificateDigest,
    payloadHash,
    appVersion,
    signature: base64(signature),
    ...extra,
  };
}

async function runtimeSignedBody(device, token, runtimeFingerprint, runtimePublicKey) {
  const { body: challenge } = await postJson(`${runtimeEndpoint}/v2/runtime/challenge`, {
    deviceId: device.deviceId,
    purpose: "runtime",
    appVersion,
  });
  const payloadHash = sha256Hex(`${token}|${runtimeFingerprint}`);
  const canonical = [
    "runtime",
    challenge.nonce,
    String(challenge.serverTime),
    device.deviceId,
    device.keyFingerprint,
    String(appVersion),
    device.certificateDigest,
    payloadHash,
  ].join("\n");
  const signature = new Uint8Array(await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    device.keyPair.privateKey,
    encoder.encode(canonical)
  ));
  return {
    purpose: "runtime",
    nonce: challenge.nonce,
    timestamp: challenge.serverTime,
    deviceId: device.deviceId,
    keyFingerprint: device.keyFingerprint,
    certificateDigest: device.certificateDigest,
    payloadHash,
    riskFlags: "",
    appVersion,
    signature: base64(signature),
    token,
    runtimePublicKey,
    runtimeKeyFingerprint: runtimeFingerprint,
  };
}

const { body: login } = await postJson(`${licenseEndpoint}/v1/admin/login`, {
  password: adminPassword,
});
const adminHeaders = { authorization: `Bearer ${login.token}` };
const createdLicenseIds = [];

async function createLicense(note) {
  const { body } = await postJson(`${licenseEndpoint}/v1/admin/licenses/create`, {
    count: 1,
    durationDays: 1,
    maxDevices: 1,
    note,
  }, adminHeaders);
  createdLicenseIds.push(body.licenses[0].id);
  return body.licenses[0];
}

try {
  const license = await createLicense("v2-lifecycle-smoke");
  const device = await createDevice("lifecycle");
  const label = "GitHub Actions V2";
  const activationPayload = await signedBody(
    licenseEndpoint,
    device,
    "activate",
    sha256Hex(`${license.key}|${device.publicKey}|${label}`),
    { licenseKey: license.key, publicKey: device.publicKey, deviceLabel: label }
  );
  const { body: activation } = await postJson(
    `${licenseEndpoint}/v1/activate`, activationPayload
  );
  if (!activation.token || activation.offlineGraceSeconds !== 86400) {
    throw new Error("Signed activation response is incomplete");
  }

  const checkPayload = await signedBody(
    licenseEndpoint,
    device,
    "check",
    sha256Hex(activation.token),
    { token: activation.token }
  );
  const { body: checked } = await postJson(`${licenseEndpoint}/v1/check`, checkPayload);
  if (!checked.token) throw new Error("Signed check did not rotate the session token");

  const runtimeKeys = await subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-1",
    },
    true,
    ["encrypt", "decrypt"]
  );
  const runtimePublicBytes = new Uint8Array(
    await subtle.exportKey("spki", runtimeKeys.publicKey)
  );
  const runtimePublicKey = base64(runtimePublicBytes);
  const runtimeFingerprint = sha256Hex(runtimePublicBytes);
  const accessPayload = await runtimeSignedBody(
    device, checked.token, runtimeFingerprint, runtimePublicKey
  );
  const { body: access } = await postJson(
    `${runtimeEndpoint}/v2/runtime/access`, accessPayload
  );
  if (!access.manifest || !access.wrappedKey || !access.bundlePath) {
    throw new Error("Runtime access response is incomplete");
  }
  if (!access.bundlePath.startsWith("/v2/runtime/bundle?version=")) {
    throw new Error(`Unsafe bundle path returned: ${access.bundlePath}`);
  }
  const bundleResponse = await fetch(`${runtimeEndpoint}${access.bundlePath}`, {
    headers: { authorization: `Bearer ${checked.token}` },
  });
  if (!bundleResponse.ok) {
    throw new Error(`Runtime bundle returned HTTP ${bundleResponse.status}`);
  }
  const bundle = Buffer.from(await bundleResponse.arrayBuffer());
  if (bundle.length !== Number(access.manifest.size)) {
    throw new Error("Runtime bundle size mismatch");
  }
  if (sha256Hex(bundle) !== String(access.manifest.sha256).toLowerCase()) {
    throw new Error("Runtime bundle hash mismatch");
  }

  const unbindPayload = await signedBody(
    licenseEndpoint,
    device,
    "unbind",
    sha256Hex(`${checked.token}|unbind`),
    { token: checked.token }
  );
  await postJson(`${licenseEndpoint}/v1/device/unbind`, unbindPayload);
  const staleCheck = await postJson(
    `${licenseEndpoint}/v1/check`,
    { ...checkPayload, token: checked.token },
    {},
    [401]
  );
  if (staleCheck.body.code !== "bad_session" && staleCheck.body.code !== "device_unbound") {
    throw new Error(`Old token remained usable after unbind: ${JSON.stringify(staleCheck.body)}`);
  }

  const concurrencyLicense = await createLicense("v2-concurrent-device-limit");
  const devices = await Promise.all([createDevice("concurrent-a"), createDevice("concurrent-b")]);
  const concurrentBodies = await Promise.all(devices.map(async (candidate) => {
    const candidateLabel = `CI ${candidate.name}`;
    return signedBody(
      licenseEndpoint,
      candidate,
      "activate",
      sha256Hex(`${concurrencyLicense.key}|${candidate.publicKey}|${candidateLabel}`),
      {
        licenseKey: concurrencyLicense.key,
        publicKey: candidate.publicKey,
        deviceLabel: candidateLabel,
      }
    );
  }));
  const concurrentResults = await Promise.all(concurrentBodies.map((body) =>
    fetch(`${licenseEndpoint}/v1/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  ));
  const statuses = concurrentResults.map((response) => response.status).sort();
  if (statuses.length !== 2 || statuses[0] !== 200 || statuses[1] !== 409) {
    throw new Error(`Atomic device limit failed: HTTP ${statuses.join(",")}`);
  }

  console.log("V2 lifecycle, runtime delivery, unbind and concurrent device-limit tests passed");
} finally {
  for (const id of createdLicenseIds) {
    try {
      await postJson(`${licenseEndpoint}/v1/admin/licenses/action`, {
        id,
        action: "disable",
      }, adminHeaders);
    } catch (error) {
      console.warn(`Failed to disable smoke-test license ${id}:`, error.message);
    }
  }
}
