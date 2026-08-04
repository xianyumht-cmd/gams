#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


path = Path("v2/runtime/src/index.js")
text = path.read_text(encoding="utf-8")

constants = '''const FULL_HISTORICAL_AB_APP_VERSION = 22;
const FULL_HISTORICAL_AB_RUNTIME_VERSION = "2.0.8-full-historical-ab-c1";
const FULL_HISTORICAL_AB_RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-full-historical-ab-20260804/candidate-runtime-full-historical/release/";
'''

if "const FULL_HISTORICAL_AB_APP_VERSION = 22;" not in text:
    marker = '''const HISTORICAL_GAME_AB_RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-game-baseline-ab-20260804/candidate-runtime-game-baseline/release/";
'''
    text = replace_once(text, marker, marker + constants, "full historical constants")

if "let fullHistoricalAbRuntimeVersion = null;" not in text:
    text = replace_once(
        text,
        "        let historicalGameAbRuntimeVersion = null;\n",
        "        let historicalGameAbRuntimeVersion = null;\n"
        "        let fullHistoricalAbRuntimeVersion = null;\n",
        "full historical health variable",
    )

if 'if (candidateQuery === "22")' not in text:
    marker = '''        if (candidateQuery === "21") {
          const historicalGameAbManifest = await loadReleaseManifest(HISTORICAL_GAME_AB_RELEASE_BASE);
          historicalGameAbRuntimeVersion = historicalGameAbManifest.versionName;
        }
'''
    addition = '''        if (candidateQuery === "22") {
          const fullHistoricalAbManifest = await loadReleaseManifest(FULL_HISTORICAL_AB_RELEASE_BASE);
          fullHistoricalAbRuntimeVersion = fullHistoricalAbManifest.versionName;
        }
'''
    text = replace_once(text, marker, marker + addition, "full historical health query")

if "fullHistoricalAbAppVersion:" not in text:
    marker = '''          historicalGameAbAppVersion: HISTORICAL_GAME_AB_APP_VERSION,
          historicalGameAbRuntimeVersion,
'''
    addition = '''          fullHistoricalAbAppVersion: FULL_HISTORICAL_AB_APP_VERSION,
          fullHistoricalAbRuntimeVersion,
'''
    text = replace_once(text, marker, marker + addition, "full historical health fields")

if "appVersion === FULL_HISTORICAL_AB_APP_VERSION" not in text:
    marker = '''function releaseBaseForAppVersion(appVersion) {
  if (appVersion === HISTORICAL_GAME_AB_APP_VERSION) return HISTORICAL_GAME_AB_RELEASE_BASE;
'''
    replacement = '''function releaseBaseForAppVersion(appVersion) {
  if (appVersion === FULL_HISTORICAL_AB_APP_VERSION) return FULL_HISTORICAL_AB_RELEASE_BASE;
  if (appVersion === HISTORICAL_GAME_AB_APP_VERSION) return HISTORICAL_GAME_AB_RELEASE_BASE;
'''
    text = replace_once(text, marker, replacement, "full historical app channel")

if "requestedVersion === FULL_HISTORICAL_AB_RUNTIME_VERSION" not in text:
    marker = '''  if (requestedVersion === HISTORICAL_GAME_AB_RUNTIME_VERSION) {
    const historicalGameAbManifest = await loadReleaseManifest(HISTORICAL_GAME_AB_RELEASE_BASE);
    if (historicalGameAbManifest.versionName === requestedVersion) {
      return { manifest: historicalGameAbManifest, releaseBase: HISTORICAL_GAME_AB_RELEASE_BASE };
    }
  }
'''
    addition = '''  if (requestedVersion === FULL_HISTORICAL_AB_RUNTIME_VERSION) {
    const fullHistoricalAbManifest = await loadReleaseManifest(FULL_HISTORICAL_AB_RELEASE_BASE);
    if (fullHistoricalAbManifest.versionName === requestedVersion) {
      return { manifest: fullHistoricalAbManifest, releaseBase: FULL_HISTORICAL_AB_RELEASE_BASE };
    }
  }
'''
    text = replace_once(text, marker, marker + addition, "full historical bundle channel")

required = (
    "const FULL_HISTORICAL_AB_APP_VERSION = 22;",
    'const FULL_HISTORICAL_AB_RUNTIME_VERSION = "2.0.8-full-historical-ab-c1";',
    "candidate-full-historical-ab-20260804/candidate-runtime-full-historical/release/",
    'if (candidateQuery === "22")',
    "fullHistoricalAbAppVersion: FULL_HISTORICAL_AB_APP_VERSION",
    "appVersion === FULL_HISTORICAL_AB_APP_VERSION",
    "requestedVersion === FULL_HISTORICAL_AB_RUNTIME_VERSION",
)
for token in required:
    if token not in text:
        raise SystemExit(f"missing full historical A/B contract: {token}")

path.write_text(text, encoding="utf-8")
print("full historical A/B channel applied")
