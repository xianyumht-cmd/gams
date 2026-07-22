# V2 encrypted runtime test channel

V1 version 8 remains active and unchanged.

## Android packages

- Client: `com.jinli.ggsecure`
- Manager: `com.jinli.ggsecure.manager`

They can be installed beside the V1 applications.

## Runtime security model

1. The release workflow packages the current control script and modified engine into one ZIP.
2. The ZIP is encrypted with a random AES-256-GCM content key.
3. Only the encrypted bundle and an encrypted content-key envelope are committed.
4. The V2 client authenticates through the existing license service.
5. The runtime Worker validates the session, bound EC device key, APK certificate digest, nonce and request signature.
6. The Worker wraps the content key to a device-local Android Keystore RSA key.
7. The APK downloads ciphertext with caching disabled, unwraps and decrypts only in memory.
8. The control script is installed from native memory and the engine request is served from native memory through WebView interception.
9. The client never writes the plaintext control script or engine to APK assets, WebView cache, SharedPreferences or local files.

This blocks the direct APK, ordinary traffic and cache extraction paths. A rooted device with runtime instrumentation can still observe plaintext in process or renderer memory; V2 does not claim to defeat a fully controlled endpoint.

## Current status

- Client and manager release APKs compile successfully.
- Package-name verification passed.
- APK scan found no JavaScript assets or known plaintext core implementation markers.
- Encrypted release scan found no known plaintext core markers.
- Cloudflare V2 runtime Worker is deployed with Android-compatible RSA-OAEP key wrapping.
- Test3 resilient DNS and direct-TLS runtime client build started.
- V1 version 8 remains unchanged during testing.

## Test2 compatibility fix

- Android RSA-OAEP key wrapping uses SHA-1/MGF1-SHA1 for older Android Keystore compatibility.
- Runtime traffic prefers `runtime.xn--8pv109c.top` and falls back to `workers.dev`.
- V1 version 8 remains unchanged.


## Test3 resilient transport

- Adds multi-resolver DNS recovery for the V2 runtime Worker.
- Adds direct Cloudflare-IP TLS transport while preserving Worker SNI and hostname verification.
- Keeps the custom domain and normal Worker HTTPS paths ahead of the direct fallback.
- V1 version 8 remains unchanged.
