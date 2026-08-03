#!/usr/bin/env python3
import sys
from pathlib import Path


AB_APP_VERSION = 20
AB_RUNTIME_VERSION = "2.0.6-remote-engine-ab-c1"
AB_RELEASE_BASE = (
    "https://raw.githubusercontent.com/xianyumht-cmd/gams/"
    "candidate-remote-engine-ab-20260804/candidate-runtime-remote-engine/release/"
)
AB_APK_VERSION_NAME = "2.0.10-remote-engine-ab"
AB_APK_VERSION_CODE = 20


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def patch_server() -> None:
    path = Path("v2/runtime/src/index.js")
    text = path.read_text(encoding="utf-8")
    marker = f"const REMOTE_ENGINE_AB_APP_VERSION = {AB_APP_VERSION};"
    if marker in text:
        required = (
            AB_RELEASE_BASE,
            "remoteEngineAbRuntimeVersion",
            "REMOTE_ENGINE_AB_RUNTIME_VERSION",
            "appVersion === REMOTE_ENGINE_AB_APP_VERSION",
        )
        for token in required:
            if token not in text:
                raise SystemExit(f"partial remote-engine A/B channel: {token}")
        print("remote-engine A/B server channel already present")
        return

    constants_old = (
        'const CANDIDATE_RELEASE_BASE =\n'
        '  "https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-script-repeat-20260804/candidate-runtime/release/";\n'
    )
    constants_new = (
        constants_old
        + f"const REMOTE_ENGINE_AB_APP_VERSION = {AB_APP_VERSION};\n"
        + f'const REMOTE_ENGINE_AB_RUNTIME_VERSION = "{AB_RUNTIME_VERSION}";\n'
        + "const REMOTE_ENGINE_AB_RELEASE_BASE =\n"
        + f'  "{AB_RELEASE_BASE}";\n'
    )
    text = replace_once(text, constants_old, constants_new, "A/B constants")

    health_old = (
        "        let candidateRuntimeVersion = null;\n"
        '        if (url.searchParams.get("candidate") === "1") {\n'
        "          const candidateManifest = await loadReleaseManifest(CANDIDATE_RELEASE_BASE);\n"
        "          candidateRuntimeVersion = candidateManifest.versionName;\n"
        "        }\n"
    )
    health_new = (
        "        let candidateRuntimeVersion = null;\n"
        "        let remoteEngineAbRuntimeVersion = null;\n"
        '        const candidateQuery = url.searchParams.get("candidate");\n'
        '        if (candidateQuery === "1") {\n'
        "          const candidateManifest = await loadReleaseManifest(CANDIDATE_RELEASE_BASE);\n"
        "          candidateRuntimeVersion = candidateManifest.versionName;\n"
        "        }\n"
        f'        if (candidateQuery === "{AB_APP_VERSION}") {{\n'
        "          const remoteEngineAbManifest = await loadReleaseManifest(REMOTE_ENGINE_AB_RELEASE_BASE);\n"
        "          remoteEngineAbRuntimeVersion = remoteEngineAbManifest.versionName;\n"
        "        }\n"
    )
    text = replace_once(text, health_old, health_new, "A/B health probe")
    text = replace_once(
        text,
        "          candidateRuntimeVersion,\n",
        "          candidateRuntimeVersion,\n"
        "          remoteEngineAbAppVersion: REMOTE_ENGINE_AB_APP_VERSION,\n"
        "          remoteEngineAbRuntimeVersion,\n",
        "A/B health fields",
    )

    release_base_old = (
        "function releaseBaseForAppVersion(appVersion) {\n"
        "  return appVersion === CANDIDATE_APP_VERSION ? CANDIDATE_RELEASE_BASE : RELEASE_BASE;\n"
        "}\n"
    )
    release_base_new = (
        "function releaseBaseForAppVersion(appVersion) {\n"
        "  if (appVersion === REMOTE_ENGINE_AB_APP_VERSION) return REMOTE_ENGINE_AB_RELEASE_BASE;\n"
        "  if (appVersion === CANDIDATE_APP_VERSION) return CANDIDATE_RELEASE_BASE;\n"
        "  return RELEASE_BASE;\n"
        "}\n"
    )
    text = replace_once(text, release_base_old, release_base_new, "A/B app-version routing")

    requested_old = (
        "  if (requestedVersion === CANDIDATE_RUNTIME_VERSION) {\n"
        "    const candidateManifest = await loadReleaseManifest(CANDIDATE_RELEASE_BASE);\n"
        "    if (candidateManifest.versionName === requestedVersion) {\n"
        "      return { manifest: candidateManifest, releaseBase: CANDIDATE_RELEASE_BASE };\n"
        "    }\n"
        "  }\n"
        '  throw new HttpError(409, "runtime_version_changed", "服务已更新，请重新启动");\n'
    )
    requested_new = (
        "  if (requestedVersion === CANDIDATE_RUNTIME_VERSION) {\n"
        "    const candidateManifest = await loadReleaseManifest(CANDIDATE_RELEASE_BASE);\n"
        "    if (candidateManifest.versionName === requestedVersion) {\n"
        "      return { manifest: candidateManifest, releaseBase: CANDIDATE_RELEASE_BASE };\n"
        "    }\n"
        "  }\n"
        "  if (requestedVersion === REMOTE_ENGINE_AB_RUNTIME_VERSION) {\n"
        "    const remoteEngineAbManifest = await loadReleaseManifest(REMOTE_ENGINE_AB_RELEASE_BASE);\n"
        "    if (remoteEngineAbManifest.versionName === requestedVersion) {\n"
        "      return { manifest: remoteEngineAbManifest, releaseBase: REMOTE_ENGINE_AB_RELEASE_BASE };\n"
        "    }\n"
        "  }\n"
        '  throw new HttpError(409, "runtime_version_changed", "服务已更新，请重新启动");\n'
    )
    text = replace_once(text, requested_old, requested_new, "A/B bundle routing")

    required = (
        marker,
        AB_RELEASE_BASE,
        "remoteEngineAbRuntimeVersion",
        "appVersion === REMOTE_ENGINE_AB_APP_VERSION",
        "requestedVersion === REMOTE_ENGINE_AB_RUNTIME_VERSION",
    )
    for token in required:
        if token not in text:
            raise SystemExit(f"missing A/B server contract: {token}")
    path.write_text(text, encoding="utf-8")
    print("remote-engine A/B server channel applied")


def patch_client() -> None:
    manager_path = Path(
        "v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java"
    )
    manager = manager_path.read_text(encoding="utf-8")
    if f"PROTOCOL_APP_VERSION = {AB_APP_VERSION}" not in manager:
        manager = replace_once(
            manager,
            "PROTOCOL_APP_VERSION = 12",
            f"PROTOCOL_APP_VERSION = {AB_APP_VERSION}",
            "A/B protocol version",
        )
    if f"版本：{AB_APK_VERSION_NAME}" not in manager:
        manager = replace_once(
            manager,
            "版本：2.0.2",
            f"版本：{AB_APK_VERSION_NAME}",
            "A/B visible version",
        )
    manager_path.write_text(manager, encoding="utf-8")

    gradle_path = Path("v2/android/client/build.gradle.kts")
    gradle = gradle_path.read_text(encoding="utf-8")
    if f"versionCode = {AB_APK_VERSION_CODE}" not in gradle:
        gradle = replace_once(
            gradle,
            "versionCode = 16",
            f"versionCode = {AB_APK_VERSION_CODE}",
            "A/B version code",
        )
    if f'versionName = "{AB_APK_VERSION_NAME}"' not in gradle:
        gradle = replace_once(
            gradle,
            'versionName = "2.0.3-stable"',
            f'versionName = "{AB_APK_VERSION_NAME}"',
            "A/B version name",
        )
    gradle_path.write_text(gradle, encoding="utf-8")
    print("remote-engine A/B client applied")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"server", "client"}:
        raise SystemExit("usage: apply_remote_engine_ab_candidate.py server|client")
    if sys.argv[1] == "server":
        patch_server()
    else:
        patch_client()


if __name__ == "__main__":
    main()
