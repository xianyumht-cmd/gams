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
- Cloudflare V2 runtime Worker is deployed and its online health check passed.
- Test2 compatibility rebuild started for Android MGF1 support and direct runtime-domain access.
- V2 is awaiting manual Android testing before any change to V1 version 8.
