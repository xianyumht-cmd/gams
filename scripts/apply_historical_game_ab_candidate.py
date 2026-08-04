#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


path = Path("v2/runtime/src/index.js")
text = path.read_text(encoding="utf-8")

constants = '''const HISTORICAL_GAME_AB_APP_VERSION = 21;
const HISTORICAL_GAME_AB_RUNTIME_VERSION = "2.0.7-game-baseline-ab-c1";
const HISTORICAL_GAME_AB_RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-game-baseline-ab-20260804/candidate-runtime-game-baseline/release/";
'''

if "const HISTORICAL_GAME_AB_APP_VERSION = 21;" not in text:
    marker = '''const REMOTE_ENGINE_AB_RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-remote-engine-ab-20260804/candidate-runtime-remote-engine/release/";
'''
    text = replace_once(text, marker, marker + constants, "historical constants")

if "let historicalGameAbRuntimeVersion = null;" not in text:
    text = replace_once(
        text,
        "        let remoteEngineAbRuntimeVersion = null;\n",
        "        let remoteEngineAbRuntimeVersion = null;\n"
        "        let historicalGameAbRuntimeVersion = null;\n",
        "historical health variable",
    )

if 'if (candidateQuery === "21")' not in text:
    marker = '''        if (candidateQuery === "20") {
          const remoteEngineAbManifest = await loadReleaseManifest(REMOTE_ENGINE_AB_RELEASE_BASE);
          remoteEngineAbRuntimeVersion = remoteEngineAbManifest.versionName;
        }
'''
    addition = '''        if (candidateQuery === "21") {
          const historicalGameAbManifest = await loadReleaseManifest(HISTORICAL_GAME_AB_RELEASE_BASE);
          historicalGameAbRuntimeVersion = historicalGameAbManifest.versionName;
        }
'''
    text = replace_once(text, marker, marker + addition, "historical health query")

if "historicalGameAbAppVersion:" not in text:
    marker = '''          remoteEngineAbAppVersion: REMOTE_ENGINE_AB_APP_VERSION,
          remoteEngineAbRuntimeVersion,
'''
    addition = '''          historicalGameAbAppVersion: HISTORICAL_GAME_AB_APP_VERSION,
          historicalGameAbRuntimeVersion,
'''
    text = replace_once(text, marker, marker + addition, "historical health fields")

if "appVersion === HISTORICAL_GAME_AB_APP_VERSION" not in text:
    marker = '''function releaseBaseForAppVersion(appVersion) {
  if (appVersion === REMOTE_ENGINE_AB_APP_VERSION) return REMOTE_ENGINE_AB_RELEASE_BASE;
'''
    replacement = '''function releaseBaseForAppVersion(appVersion) {
  if (appVersion === HISTORICAL_GAME_AB_APP_VERSION) return HISTORICAL_GAME_AB_RELEASE_BASE;
  if (appVersion === REMOTE_ENGINE_AB_APP_VERSION) return REMOTE_ENGINE_AB_RELEASE_BASE;
'''
    text = replace_once(text, marker, replacement, "historical app channel")

if "requestedVersion === HISTORICAL_GAME_AB_RUNTIME_VERSION" not in text:
    marker = '''  if (requestedVersion === REMOTE_ENGINE_AB_RUNTIME_VERSION) {
    const remoteEngineAbManifest = await loadReleaseManifest(REMOTE_ENGINE_AB_RELEASE_BASE);
    if (remoteEngineAbManifest.versionName === requestedVersion) {
      return { manifest: remoteEngineAbManifest, releaseBase: REMOTE_ENGINE_AB_RELEASE_BASE };
    }
  }
'''
    addition = '''  if (requestedVersion === HISTORICAL_GAME_AB_RUNTIME_VERSION) {
    const historicalGameAbManifest = await loadReleaseManifest(HISTORICAL_GAME_AB_RELEASE_BASE);
    if (historicalGameAbManifest.versionName === requestedVersion) {
      return { manifest: historicalGameAbManifest, releaseBase: HISTORICAL_GAME_AB_RELEASE_BASE };
    }
  }
'''
    text = replace_once(text, marker, marker + addition, "historical bundle channel")

required = (
    "const HISTORICAL_GAME_AB_APP_VERSION = 21;",
    'const HISTORICAL_GAME_AB_RUNTIME_VERSION = "2.0.7-game-baseline-ab-c1";',
    "candidate-game-baseline-ab-20260804/candidate-runtime-game-baseline/release/",
    'if (candidateQuery === "21")',
    "historicalGameAbAppVersion: HISTORICAL_GAME_AB_APP_VERSION",
    "appVersion === HISTORICAL_GAME_AB_APP_VERSION",
    "requestedVersion === HISTORICAL_GAME_AB_RUNTIME_VERSION",
)
for token in required:
    if token not in text:
        raise SystemExit(f"missing historical A/B contract: {token}")

path.write_text(text, encoding="utf-8")
print("historical game A/B channel applied")
