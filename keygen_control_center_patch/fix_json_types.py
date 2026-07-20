from pathlib import Path

path = Path("keygen/src/main/java/com/jinli/keygen/MainActivity.java")
text = path.read_text(encoding="utf-8")
replacements = {
    "JSONObject body =": "J body =",
    "JSONObject changes =": "J changes =",
    "JSONObject id =": "J id =",
    "private JSONObject identifier(": "private J identifier(",
}
for old, new in replacements.items():
    text = text.replace(old, new)
if "private J identifier(" not in text:
    raise SystemExit("Cannot apply safe JSON type fix")
path.write_text(text, encoding="utf-8")
print("Applied GG manager safe JSON type fix")
