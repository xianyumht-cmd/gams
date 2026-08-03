#!/usr/bin/env python3
import sys
from pathlib import Path


CANDIDATE_APP_VERSION = 19
CANDIDATE_RUNTIME_VERSION = "2.0.5-script-repeat-c1"
CANDIDATE_RELEASE_BASE = (
    "https://raw.githubusercontent.com/xianyumht-cmd/gams/"
    "candidate-script-repeat-20260804/candidate-runtime/release/"
)
CANDIDATE_APK_VERSION_NAME = "2.0.9-script-candidate"
CANDIDATE_APK_VERSION_CODE = 19


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def patch_runtime() -> None:
    path = Path("v2/runtime/src/index.js")
    text = path.read_text(encoding="utf-8")
    if "const CANDIDATE_APP_VERSION = 19;" in text:
        required = (
            CANDIDATE_RELEASE_BASE,
            "releaseBaseForAppVersion(appVersion)",
            "releaseForRequestedVersion(requestedVersion)",
            "candidateChannel: true",
            "candidateRuntimeVersion",
        )
        for token in required:
            if token not in text:
                raise SystemExit(f"partial candidate runtime channel: {token}")
        print("candidate runtime channel already present")
        return

    constants_old = (
        'const RELEASE_BASE =\n'
        '  "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/v2/runtime/release/";\n'
    )
    constants_new = (
        constants_old
        + f"const CANDIDATE_APP_VERSION = {CANDIDATE_APP_VERSION};\n"
        + f'const CANDIDATE_RUNTIME_VERSION = "{CANDIDATE_RUNTIME_VERSION}";\n'
        + "const CANDIDATE_RELEASE_BASE =\n"
        + f'  "{CANDIDATE_RELEASE_BASE}";\n'
    )
    text = replace_once(text, constants_old, constants_new, "runtime constants")
    text = replace_once(
        text,
        "let releaseCache = null;",
        "const releaseCache = new Map();",
        "release cache",
    )

    health_old = (
        '      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {\n'
        "        return json({\n"
    )
    health_new = (
        '      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {\n'
        "        let candidateRuntimeVersion = null;\n"
        '        if (url.searchParams.get("candidate") === "1") {\n'
        "          const candidateManifest = await loadReleaseManifest(CANDIDATE_RELEASE_BASE);\n"
        "          candidateRuntimeVersion = candidateManifest.versionName;\n"
        "        }\n"
        "        return json({\n"
    )
    text = replace_once(text, health_old, health_new, "health candidate probe")
    health_marker = "          legacyReleaseCompatible: true,\n"
    health_fields = (
        health_marker
        + "          candidateChannel: true,\n"
        + "          candidateAppVersion: CANDIDATE_APP_VERSION,\n"
        + "          candidateRuntimeVersion,\n"
    )
    text = replace_once(text, health_marker, health_fields, "health candidate fields")

    access_old = "  const manifest = await loadReleaseManifest();\n"
    access_new = (
        "  const releaseBase = releaseBaseForAppVersion(appVersion);\n"
        "  const manifest = await loadReleaseManifest(releaseBase);\n"
    )
    text = replace_once(text, access_old, access_new, "runtime access channel")

    bundle_old = (
        "  const manifest = await loadReleaseManifest();\n"
        '  const requestedVersion = new URL(request.url).searchParams.get("version") || "";\n'
        "  if (requestedVersion !== manifest.versionName) {\n"
        '    throw new HttpError(409, "runtime_version_changed", "服务已更新，请重新启动");\n'
        "  }\n"
    )
    bundle_new = (
        '  const requestedVersion = new URL(request.url).searchParams.get("version") || "";\n'
        "  const release = await releaseForRequestedVersion(requestedVersion);\n"
        "  const manifest = release.manifest;\n"
    )
    text = replace_once(text, bundle_old, bundle_new, "runtime bundle channel")
    text = replace_once(
        text,
        "  const upstream = await githubFetch(`${RELEASE_BASE}${manifest.file}`);",
        "  const upstream = await githubFetch(`${release.releaseBase}${manifest.file}`);",
        "runtime bundle release base",
    )

    loader_old = (
        "async function loadReleaseManifest() {\n"
        "  const now = Date.now();\n"
        "  if (releaseCache && releaseCache.expiresAt > now) return releaseCache.manifest;\n"
        "  const response = await githubFetch(`${RELEASE_BASE}manifest.json`);\n"
    )
    loader_new = (
        "function releaseBaseForAppVersion(appVersion) {\n"
        "  return appVersion === CANDIDATE_APP_VERSION ? CANDIDATE_RELEASE_BASE : RELEASE_BASE;\n"
        "}\n\n"
        "async function releaseForRequestedVersion(requestedVersion) {\n"
        "  const productionManifest = await loadReleaseManifest(RELEASE_BASE);\n"
        "  if (requestedVersion === productionManifest.versionName) {\n"
        "    return { manifest: productionManifest, releaseBase: RELEASE_BASE };\n"
        "  }\n"
        "  if (requestedVersion === CANDIDATE_RUNTIME_VERSION) {\n"
        "    const candidateManifest = await loadReleaseManifest(CANDIDATE_RELEASE_BASE);\n"
        "    if (candidateManifest.versionName === requestedVersion) {\n"
        "      return { manifest: candidateManifest, releaseBase: CANDIDATE_RELEASE_BASE };\n"
        "    }\n"
        "  }\n"
        '  throw new HttpError(409, "runtime_version_changed", "服务已更新，请重新启动");\n'
        "}\n\n"
        "async function loadReleaseManifest(releaseBase = RELEASE_BASE) {\n"
        "  const now = Date.now();\n"
        "  const cached = releaseCache.get(releaseBase);\n"
        "  if (cached && cached.expiresAt > now) return cached.manifest;\n"
        "  const response = await githubFetch(`${releaseBase}manifest.json`);\n"
    )
    text = replace_once(text, loader_old, loader_new, "release manifest loader")
    text = replace_once(
        text,
        "  releaseCache = { manifest, expiresAt: now + 30_000 };\n  return manifest;",
        "  releaseCache.set(releaseBase, { manifest, expiresAt: now + 30_000 });\n  return manifest;",
        "release manifest cache write",
    )

    required = (
        "const CANDIDATE_APP_VERSION = 19;",
        CANDIDATE_RELEASE_BASE,
        "candidateChannel: true",
        "releaseBaseForAppVersion(appVersion)",
        "releaseForRequestedVersion(requestedVersion)",
        "releaseCache.set(releaseBase",
        "`${release.releaseBase}${manifest.file}`",
    )
    for token in required:
        if token not in text:
            raise SystemExit(f"missing runtime channel contract: {token}")
    path.write_text(text, encoding="utf-8")
    print("candidate runtime channel applied")


def patch_client() -> None:
    manager_path = Path(
        "v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java"
    )
    manager = manager_path.read_text(encoding="utf-8")
    if "PROTOCOL_APP_VERSION = 19" not in manager:
        manager = replace_once(
            manager,
            "PROTOCOL_APP_VERSION = 12",
            f"PROTOCOL_APP_VERSION = {CANDIDATE_APP_VERSION}",
            "candidate protocol version",
        )
    if '版本：2.0.9-script-candidate' not in manager:
        manager = replace_once(
            manager,
            '版本：2.0.2',
            f'版本：{CANDIDATE_APK_VERSION_NAME}',
            "candidate status version",
        )
    manager_path.write_text(manager, encoding="utf-8")

    gradle_path = Path("v2/android/client/build.gradle.kts")
    gradle = gradle_path.read_text(encoding="utf-8")
    if f"versionCode = {CANDIDATE_APK_VERSION_CODE}" not in gradle:
        gradle = replace_once(
            gradle,
            "versionCode = 16",
            f"versionCode = {CANDIDATE_APK_VERSION_CODE}",
            "candidate version code",
        )
    if f'versionName = "{CANDIDATE_APK_VERSION_NAME}"' not in gradle:
        gradle = replace_once(
            gradle,
            'versionName = "2.0.3-stable"',
            f'versionName = "{CANDIDATE_APK_VERSION_NAME}"',
            "candidate version name",
        )
    gradle_path.write_text(gradle, encoding="utf-8")
    print("candidate client protocol channel applied")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"runtime", "client"}:
        raise SystemExit("usage: apply_candidate_runtime_channel.py runtime|client")
    if sys.argv[1] == "runtime":
        patch_runtime()
    else:
        patch_client()


if __name__ == "__main__":
    main()
