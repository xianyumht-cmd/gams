#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


path = Path("v2/runtime/src/index.js")
text = path.read_text(encoding="utf-8")

constants = '''const LATEST_PAGE_APP_VERSION = 23;
const LATEST_PAGE_RUNTIME_VERSION = "2.0.9-latest-page-c1";
const LATEST_PAGE_RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-latest-page-20260804/candidate-runtime-latest-page/release/";
'''

if "const LATEST_PAGE_APP_VERSION = 23;" not in text:
    marker = '''const FULL_HISTORICAL_AB_RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-full-historical-ab-20260804/candidate-runtime-full-historical/release/";
'''
    text = replace_once(text, marker, marker + constants, "latest page constants")

if "let latestPageRuntimeVersion = null;" not in text:
    text = replace_once(
        text,
        "        let fullHistoricalAbRuntimeVersion = null;\n",
        "        let fullHistoricalAbRuntimeVersion = null;\n"
        "        let latestPageRuntimeVersion = null;\n",
        "latest page health variable",
    )

if 'if (candidateQuery === "23")' not in text:
    marker = '''        if (candidateQuery === "22") {
          const fullHistoricalAbManifest = await loadReleaseManifest(FULL_HISTORICAL_AB_RELEASE_BASE);
          fullHistoricalAbRuntimeVersion = fullHistoricalAbManifest.versionName;
        }
'''
    addition = '''        if (candidateQuery === "23") {
          const latestPageManifest = await loadReleaseManifest(LATEST_PAGE_RELEASE_BASE);
          latestPageRuntimeVersion = latestPageManifest.versionName;
        }
'''
    text = replace_once(text, marker, marker + addition, "latest page health query")

if "latestPageAppVersion:" not in text:
    marker = '''          fullHistoricalAbAppVersion: FULL_HISTORICAL_AB_APP_VERSION,
          fullHistoricalAbRuntimeVersion,
'''
    addition = '''          latestPageAppVersion: LATEST_PAGE_APP_VERSION,
          latestPageRuntimeVersion,
'''
    text = replace_once(text, marker, marker + addition, "latest page health fields")

if "appVersion === LATEST_PAGE_APP_VERSION" not in text:
    marker = '''function releaseBaseForAppVersion(appVersion) {
  if (appVersion === FULL_HISTORICAL_AB_APP_VERSION) return FULL_HISTORICAL_AB_RELEASE_BASE;
'''
    replacement = '''function releaseBaseForAppVersion(appVersion) {
  if (appVersion === LATEST_PAGE_APP_VERSION) return LATEST_PAGE_RELEASE_BASE;
  if (appVersion === FULL_HISTORICAL_AB_APP_VERSION) return FULL_HISTORICAL_AB_RELEASE_BASE;
'''
    text = replace_once(text, marker, replacement, "latest page app channel")

if "requestedVersion === LATEST_PAGE_RUNTIME_VERSION" not in text:
    marker = '''  if (requestedVersion === FULL_HISTORICAL_AB_RUNTIME_VERSION) {
    const fullHistoricalAbManifest = await loadReleaseManifest(FULL_HISTORICAL_AB_RELEASE_BASE);
    if (fullHistoricalAbManifest.versionName === requestedVersion) {
      return { manifest: fullHistoricalAbManifest, releaseBase: FULL_HISTORICAL_AB_RELEASE_BASE };
    }
  }
'''
    addition = '''  if (requestedVersion === LATEST_PAGE_RUNTIME_VERSION) {
    const latestPageManifest = await loadReleaseManifest(LATEST_PAGE_RELEASE_BASE);
    if (latestPageManifest.versionName === requestedVersion) {
      return { manifest: latestPageManifest, releaseBase: LATEST_PAGE_RELEASE_BASE };
    }
  }
'''
    text = replace_once(text, marker, marker + addition, "latest page bundle channel")

required = (
    "const LATEST_PAGE_APP_VERSION = 23;",
    'const LATEST_PAGE_RUNTIME_VERSION = "2.0.9-latest-page-c1";',
    "candidate-latest-page-20260804/candidate-runtime-latest-page/release/",
    'if (candidateQuery === "23")',
    "latestPageAppVersion: LATEST_PAGE_APP_VERSION",
    "appVersion === LATEST_PAGE_APP_VERSION",
    "requestedVersion === LATEST_PAGE_RUNTIME_VERSION",
)
for token in required:
    if token not in text:
        raise SystemExit(f"missing latest-page channel contract: {token}")

path.write_text(text, encoding="utf-8")
print("latest-page candidate channel applied")
