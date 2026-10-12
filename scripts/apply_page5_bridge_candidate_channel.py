#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


path = Path("v2/runtime/src/index.js")
text = path.read_text(encoding="utf-8")

constants = '''const PAGE5_BRIDGE_APP_VERSION = 24;
const PAGE5_BRIDGE_RUNTIME_VERSION = "2.0.9-page5-bridge-c1";
const PAGE5_BRIDGE_RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-page5-bridge-20260806/candidate-runtime-page5-bridge/release/";
'''

if "const PAGE5_BRIDGE_APP_VERSION = 24;" not in text:
    marker = '''const FULL_HISTORICAL_AB_RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-full-historical-ab-20260804/candidate-runtime-full-historical/release/";
'''
    text = replace_once(text, marker, marker + constants, "page five bridge constants")

if "let page5BridgeRuntimeVersion = null;" not in text:
    text = replace_once(
        text,
        "        let fullHistoricalAbRuntimeVersion = null;\n",
        "        let fullHistoricalAbRuntimeVersion = null;\n"
        "        let page5BridgeRuntimeVersion = null;\n",
        "page five bridge health variable",
    )

if 'if (candidateQuery === "24")' not in text:
    marker = '''        if (candidateQuery === "22") {
          const fullHistoricalAbManifest = await loadReleaseManifest(FULL_HISTORICAL_AB_RELEASE_BASE);
          fullHistoricalAbRuntimeVersion = fullHistoricalAbManifest.versionName;
        }
'''
    addition = '''        if (candidateQuery === "24") {
          const page5BridgeManifest = await loadReleaseManifest(PAGE5_BRIDGE_RELEASE_BASE);
          page5BridgeRuntimeVersion = page5BridgeManifest.versionName;
        }
'''
    text = replace_once(text, marker, marker + addition, "page five bridge health query")

if "page5BridgeAppVersion:" not in text:
    marker = '''          fullHistoricalAbAppVersion: FULL_HISTORICAL_AB_APP_VERSION,
          fullHistoricalAbRuntimeVersion,
'''
    addition = '''          page5BridgeAppVersion: PAGE5_BRIDGE_APP_VERSION,
          page5BridgeRuntimeVersion,
'''
    text = replace_once(text, marker, marker + addition, "page five bridge health fields")

if "appVersion === PAGE5_BRIDGE_APP_VERSION" not in text:
    marker = '''function releaseBaseForAppVersion(appVersion) {
  if (appVersion === FULL_HISTORICAL_AB_APP_VERSION) return FULL_HISTORICAL_AB_RELEASE_BASE;
'''
    replacement = '''function releaseBaseForAppVersion(appVersion) {
  if (appVersion === PAGE5_BRIDGE_APP_VERSION) return PAGE5_BRIDGE_RELEASE_BASE;
  if (appVersion === FULL_HISTORICAL_AB_APP_VERSION) return FULL_HISTORICAL_AB_RELEASE_BASE;
'''
    text = replace_once(text, marker, replacement, "page five bridge app channel")

if "requestedVersion === PAGE5_BRIDGE_RUNTIME_VERSION" not in text:
    marker = '''  if (requestedVersion === FULL_HISTORICAL_AB_RUNTIME_VERSION) {
    const fullHistoricalAbManifest = await loadReleaseManifest(FULL_HISTORICAL_AB_RELEASE_BASE);
    if (fullHistoricalAbManifest.versionName === requestedVersion) {
      return { manifest: fullHistoricalAbManifest, releaseBase: FULL_HISTORICAL_AB_RELEASE_BASE };
    }
  }
'''
    addition = '''  if (requestedVersion === PAGE5_BRIDGE_RUNTIME_VERSION) {
    const page5BridgeManifest = await loadReleaseManifest(PAGE5_BRIDGE_RELEASE_BASE);
    if (page5BridgeManifest.versionName === requestedVersion) {
      return { manifest: page5BridgeManifest, releaseBase: PAGE5_BRIDGE_RELEASE_BASE };
    }
  }
'''
    text = replace_once(text, marker, marker + addition, "page five bridge bundle channel")

required = (
    "const PAGE5_BRIDGE_APP_VERSION = 24;",
    'const PAGE5_BRIDGE_RUNTIME_VERSION = "2.0.9-page5-bridge-c1";',
    "candidate-page5-bridge-20260806/candidate-runtime-page5-bridge/release/",
    'if (candidateQuery === "24")',
    "page5BridgeAppVersion: PAGE5_BRIDGE_APP_VERSION",
    "appVersion === PAGE5_BRIDGE_APP_VERSION",
    "requestedVersion === PAGE5_BRIDGE_RUNTIME_VERSION",
)
for token in required:
    if token not in text:
        raise SystemExit(f"missing page five bridge channel contract: {token}")

path.write_text(text, encoding="utf-8")
print("page five bridge candidate channel applied")
