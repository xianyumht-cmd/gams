from pathlib import Path

path = Path("src/index.js")
text = path.read_text(encoding="utf-8")
marker = '    const parsed = row ? JSON.parse(row.settings_json) : {};'
addition = marker + '\n    parsed.latestAppVersion = Math.max(8, Number(parsed.latestAppVersion || 0));'
if addition not in text:
    if marker not in text:
        raise SystemExit("Missing dynamic settings parser")
    text = text.replace(marker, addition, 1)
path.write_text(text, encoding="utf-8")
print("Enforced GG v1.4 latest-version baseline")
