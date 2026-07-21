# Self-hosted game engine

This directory stores immutable, versioned snapshots of the modified game runtime.

## Current stable release

- Version: `1.0.2`
- File: `release/game-1.0.2.js`
- Size: `11589175` bytes
- SHA-256: `51ae52887d0c0475870e4c985edf747a14672f0908221779826934f37b73db43`
- Runtime URL: `https://gams-script-edge.2320006072.workers.dev/engine/stable.js`

The original `space-z.ai` URL is retained only as release provenance in the signed manifest. Runtime traffic is redirected to the self-hosted Cloudflare Worker endpoint.

## Updating

Run the **Publish versioned game engine** workflow with a new HTTPS source URL, a higher semantic version, and the expected SHA-256. The workflow downloads, verifies, signs and publishes an immutable version without changing `noname.js`, because `/engine/stable.js` resolves the signed stable manifest.

## Upstream monitoring

The upstream monitor compares the official page, `game.js`, `SALInterface.js`, `webGLLib.js` and `GameInfoData.js` against `upstream-baseline.json`. Changes open a GitHub issue but do not automatically replace the stable engine.
