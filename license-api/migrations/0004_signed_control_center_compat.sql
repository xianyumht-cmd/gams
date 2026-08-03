-- Normalize settings retained from the historical control center to the signed V2 protocol contract.
UPDATE system_settings
SET settings_json = json_set(
      settings_json,
      '$.offlineGraceSeconds', 86400,
      '$.legacyOfflineGraceSeconds', 86400,
      '$.minAppVersion', CASE
        WHEN COALESCE(json_extract(settings_json, '$.minAppVersion'), 0) < 11 THEN 11
        ELSE json_extract(settings_json, '$.minAppVersion')
      END,
      '$.secureAppVersion', CASE
        WHEN COALESCE(json_extract(settings_json, '$.secureAppVersion'), 0) < 11 THEN 11
        ELSE json_extract(settings_json, '$.secureAppVersion')
      END,
      '$.latestAppVersion', CASE
        WHEN COALESCE(json_extract(settings_json, '$.latestAppVersion'), 0) < 12 THEN 12
        ELSE json_extract(settings_json, '$.latestAppVersion')
      END
    ),
    config_version = config_version + 1,
    updated_at = unixepoch(),
    updated_by = 'signed-control-center-compat'
WHERE id = 1;

INSERT INTO system_settings_history(
  id, config_version, settings_json, changed_at, changed_by, reason
)
SELECT
  lower(hex(randomblob(16))),
  config_version,
  settings_json,
  unixepoch(),
  'signed-control-center-compat',
  'Normalize historical settings to the signed V2 protocol contract'
FROM system_settings
WHERE id = 1;
