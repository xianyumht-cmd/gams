#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"missing environment variable: {name}")
    return value


def patch_runtime() -> None:
    branch = required_env("CANDIDATE_BRANCH")
    prefix = required_env("CANDIDATE_PREFIX")
    route = required_env("CANDIDATE_ROUTE")
    worker_name = required_env("CANDIDATE_WORKER_NAME")
    zone_id = required_env("ZONE_ID")
    database_id = required_env("D1_DATABASE_ID")

    source_path = Path("v2/runtime/src/index.js")
    source = source_path.read_text(encoding="utf-8")
    old_base = (
        '  "https://raw.githubusercontent.com/'
        'xianyumht-cmd/gams/main/v2/runtime/release/";'
    )
    new_base = (
        '  "https://raw.githubusercontent.com/'
        f'xianyumht-cmd/gams/{branch}/candidate-runtime/release/";'
    )
    source = replace_once(source, old_base, new_base, "candidate release base")

    old_fetch = "  async fetch(request, env) {\n    try {"
    new_fetch = (
        "  async fetch(request, env) {\n"
        "    const candidateUrl = new URL(request.url);\n"
        f'    const candidatePrefix = "{prefix}";\n'
        "    if (candidateUrl.pathname === candidatePrefix "
        "|| candidateUrl.pathname.startsWith(candidatePrefix + \"/\")) {\n"
        "      candidateUrl.pathname = "
        "candidateUrl.pathname.slice(candidatePrefix.length) || \"/\";\n"
        "      request = new Request(candidateUrl.toString(), request);\n"
        "    }\n"
        "    try {"
    )
    source = replace_once(source, old_fetch, new_fetch, "runtime fetch entry")
    source_path.write_text(source, encoding="utf-8")

    template_path = Path("v2/runtime/wrangler.template.jsonc")
    template = json.loads(template_path.read_text(encoding="utf-8"))
    template["name"] = worker_name
    template["workers_dev"] = True
    template["preview_urls"] = False
    template["routes"] = [{"pattern": route, "zone_id": zone_id}]
    template["d1_databases"][0]["database_id"] = database_id
    output_path = Path("v2/runtime/wrangler.candidate-path.jsonc")
    output_path.write_text(
        json.dumps(template, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("candidate runtime path route applied")


def patch_client() -> None:
    fallback_host = required_env("FALLBACK_HOST")
    prefix = required_env("CANDIDATE_PREFIX")
    version_name = required_env("APK_VERSION_NAME")
    version_code = required_env("APK_VERSION_CODE")

    names_path = Path(
        "v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeNames.java"
    )
    names = names_path.read_text(encoding="utf-8")
    names = replace_once(
        names,
        '        return "gams-runtime-v2." + "2320006072.workers.dev";',
        f'        return "{fallback_host}";',
        "runtime fallback host",
    )
    names_path.write_text(names, encoding="utf-8")

    transport_path = Path(
        "v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeTransport.java"
    )
    transport = transport_path.read_text(encoding="utf-8")
    old_post = (
        '        return requestAcrossChannels(\n'
        '                "POST", path, json.getBytes(StandardCharsets.UTF_8), '
        '"", maximumBytes, true);'
    )
    new_post = (
        '        return requestAcrossChannels(\n'
        '                "POST", candidatePath(path), '
        'json.getBytes(StandardCharsets.UTF_8), "", maximumBytes, true);'
    )
    old_get = (
        '        Response response = requestAcrossChannels(\n'
        '                "GET", path, null, authorization, maximumBytes, false);'
    )
    new_get = (
        '        Response response = requestAcrossChannels(\n'
        '                "GET", candidatePath(path), null, authorization, '
        'maximumBytes, false);'
    )
    transport = replace_once(transport, old_post, new_post, "runtime POST path")
    transport = replace_once(transport, old_get, new_get, "runtime GET path")
    marker = "    private static Response requestAcrossChannels(\n"
    helper = (
        "    private static String candidatePath(String path) {\n"
        '        String value = path == null ? "" : path.trim();\n'
        '        if (!value.startsWith("/")) value = "/" + value;\n'
        f'        return "{prefix}" + value;\n'
        "    }\n\n"
    )
    transport = replace_once(
        transport, marker, helper + marker, "runtime path helper insertion"
    )
    transport_path.write_text(transport, encoding="utf-8")

    gradle_path = Path("v2/android/client/build.gradle.kts")
    gradle = gradle_path.read_text(encoding="utf-8")
    gradle = replace_once(
        gradle,
        "versionCode = 16",
        f"versionCode = {version_code}",
        "candidate version code",
    )
    gradle = replace_once(
        gradle,
        'versionName = "2.0.3-stable"',
        f'versionName = "{version_name}"',
        "candidate version name",
    )
    gradle_path.write_text(gradle, encoding="utf-8")
    print("candidate client path routing applied")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"runtime", "client"}:
        raise SystemExit("usage: apply_path_route_candidate.py runtime|client")
    if sys.argv[1] == "runtime":
        patch_runtime()
    else:
        patch_client()


if __name__ == "__main__":
    main()
