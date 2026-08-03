#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LICENSE = ROOT / "license-api/src/index.js"
MIGRATION = ROOT / "license-api/migrations/0004_signed_control_center_compat.sql"

text = LICENSE.read_text(encoding="utf-8")
marker = """    value.latestAppVersion = Math.max(12, value.latestAppVersion);\n    value.configVersion = Number(row?.config_version || 1);"""
replacement = """    value.latestAppVersion = Math.max(12, value.latestAppVersion);\n    value.offlineGraceSeconds = Math.max(86400, Number(value.offlineGraceSeconds || 0));\n    value.legacyOfflineGraceSeconds = Math.max(86400, Number(value.legacyOfflineGraceSeconds || 0));\n    value.configVersion = Number(row?.config_version || 1);"""
if text.count(marker) != 1:
    raise SystemExit(f"loadSettings compatibility marker expected once, found {text.count(marker)}")
text = text.replace(marker, replacement, 1)

fallback_marker = """    return { ...DEFAULT_SETTINGS, configVersion: 1 };"""
fallback_replacement = """    return {\n      ...DEFAULT_SETTINGS,\n      offlineGraceSeconds: 86400,\n      legacyOfflineGraceSeconds: 86400,\n      configVersion: 1,\n    };"""
if text.count(fallback_marker) != 1:
    raise SystemExit(f"settings fallback marker expected once, found {text.count(fallback_marker)}")
text = text.replace(fallback_marker, fallback_replacement, 1)

LICENSE.write_text(text, encoding="utf-8")

MIGRATION.write_text(
    """-- Normalize settings retained from the historical control center to the signed V2 protocol contract.\nUPDATE system_settings\nSET settings_json = json_set(\n      settings_json,\n      '$.offlineGraceSeconds', 86400,\n      '$.legacyOfflineGraceSeconds', 86400,\n      '$.minAppVersion', CASE\n        WHEN COALESCE(json_extract(settings_json, '$.minAppVersion'), 0) < 11 THEN 11\n        ELSE json_extract(settings_json, '$.minAppVersion')\n      END,\n      '$.secureAppVersion', CASE\n        WHEN COALESCE(json_extract(settings_json, '$.secureAppVersion'), 0) < 11 THEN 11\n        ELSE json_extract(settings_json, '$.secureAppVersion')\n      END,\n      '$.latestAppVersion', CASE\n        WHEN COALESCE(json_extract(settings_json, '$.latestAppVersion'), 0) < 12 THEN 12\n        ELSE json_extract(settings_json, '$.latestAppVersion')\n      END\n    ),\n    config_version = config_version + 1,\n    updated_at = unixepoch(),\n    updated_by = 'signed-control-center-compat'\nWHERE id = 1;\n\nINSERT INTO system_settings_history(\n  id, config_version, settings_json, changed_at, changed_by, reason\n)\nSELECT\n  lower(hex(randomblob(16))),\n  config_version,\n  settings_json,\n  unixepoch(),\n  'signed-control-center-compat',\n  'Normalize historical settings to the signed V2 protocol contract'\nFROM system_settings\nWHERE id = 1;\n""",
    encoding="utf-8",
)

print("signed control center protocol compatibility applied")
