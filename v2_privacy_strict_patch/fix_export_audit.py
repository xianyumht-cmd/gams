from pathlib import Path

MODULE = Path("v2/android/client")
LOGGER = MODULE / "src/main/java/com/jinli/ggsecure/DiagnosticLogger.java"
MAIN = MODULE / "src/main/java/com/jinli/ggsecure/MainActivity.java"
BUILD = MODULE / "build.gradle.kts"

logger = LOGGER.read_text(encoding="utf-8")

old_import = "import android.content.Context;\nimport android.content.Intent;"
new_import = "import android.content.ClipData;\nimport android.content.Context;\nimport android.content.Intent;"
if logger.count(old_import) != 1:
    raise SystemExit("DiagnosticLogger import anchor mismatch")
logger = logger.replace(old_import, new_import, 1)

old_object_block = '''        if (value instanceof JSONObject) {
            JSONObject input = (JSONObject) value;
            JSONObject output = new JSONObject();
            JSONArray names = input.names();
            if (names == null) return output;
            int count = Math.min(names.length(), 40);
            for (int i = 0; i < count; i++) {
                String name = safeSchemaKey(names.optString(i, "field"));
                try { output.put(name, strictJson(input.opt(names.optString(i)), name, depth + 1)); }
                catch (Throwable ignored) { }
            }
            return output;
        }
'''
new_object_block = '''        if (value instanceof JSONObject) {
            JSONObject input = (JSONObject) value;
            JSONObject output = new JSONObject();
            JSONArray names = input.names();
            if (names == null) return output;
            int count = Math.min(names.length(), 40);
            for (int i = 0; i < count; i++) {
                String sourceName = names.optString(i, "field");
                String anonymousName = "F" + (i + 1);
                try { output.put(anonymousName, strictJson(input.opt(sourceName), sourceName, depth + 1)); }
                catch (Throwable ignored) { }
            }
            return output;
        }
'''
if logger.count(old_object_block) != 1:
    raise SystemExit("strictJson object block anchor mismatch")
logger = logger.replace(old_object_block, new_object_block, 1)

old_share = '''            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/zip");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(Intent.createChooser(intent, "发送匿名诊断日志"));
        } catch (Throwable error) {
            logError("native", "export_failure", error);
            throw new IllegalStateException("隐私审计未通过，日志没有导出", error);
        }
'''
new_share = '''            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/zip");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.setClipData(ClipData.newRawUri("anonymous-diagnostic", uri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(Intent.createChooser(intent, "发送匿名诊断日志"));
        } catch (SecurityException error) {
            logError("native", "export_privacy_rejected", error);
            throw new IllegalStateException("隐私审计拒绝导出（E-AUDIT）", error);
        } catch (Throwable error) {
            logError("native", "export_share_failure", error);
            throw new IllegalStateException("日志生成或分享失败（E-SHARE）", error);
        }
'''
if logger.count(old_share) != 1:
    raise SystemExit("share block anchor mismatch")
logger = logger.replace(old_share, new_share, 1)

old_audit = '''    private void assertPrivacySafe(File file) throws Exception {
        if (!file.isFile()) return;
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(file));
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            String text = output.toString("UTF-8");
            if (URL_PATTERN.matcher(text).find() || HOST_PATTERN.matcher(text).find() ||
                    EMAIL_PATTERN.matcher(text).find() || SECRET_PATTERN.matcher(text).find() ||
                    LONG_HEX_PATTERN.matcher(text).find() || CJK_PATTERN.matcher(text).find() ||
                    WINDOWS_PATH_PATTERN.matcher(text).find()) {
                throw new SecurityException("privacy-audit-failed");
            }
        }
    }
'''
new_audit = '''    private void assertPrivacySafe(File file) throws Exception {
        if (!file.isFile()) return;
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(file));
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            String text = output.toString("UTF-8");
            String[] lines = text.split("\\\\r?\\\\n");
            for (String line : lines) {
                if (line == null || line.trim().isEmpty()) continue;
                JSONObject record = new JSONObject(line);
                auditDetailValue(record.opt("detail"), 0);
            }
        }
    }

    private void auditDetailValue(Object value, int depth) {
        if (value == null || value == JSONObject.NULL) return;
        if (depth > 8) throw new SecurityException("privacy-depth-limit");
        if (value instanceof Boolean || value instanceof Number) return;
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            for (int i = 0; i < array.length(); i++) auditDetailValue(array.opt(i), depth + 1);
            return;
        }
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            JSONArray names = object.names();
            if (names == null) return;
            for (int i = 0; i < names.length(); i++) {
                String name = names.optString(i, "");
                if (!isSafeDetailKey(name)) throw new SecurityException("privacy-field-name");
                auditDetailValue(object.opt(name), depth + 1);
            }
            return;
        }
        String text = String.valueOf(value);
        if (text.length() > MAX_DETAIL_CHARS ||
                URL_PATTERN.matcher(text).find() || HOST_PATTERN.matcher(text).find() ||
                EMAIL_PATTERN.matcher(text).find() || SECRET_PATTERN.matcher(text).find() ||
                LONG_HEX_PATTERN.matcher(text).find() || CJK_PATTERN.matcher(text).find() ||
                WINDOWS_PATH_PATTERN.matcher(text).find() || UNIX_PATH_PATTERN.matcher(text).find()) {
            throw new SecurityException("privacy-value");
        }
    }

    private static boolean isSafeDetailKey(String value) {
        if (value == null) return false;
        return value.matches("^(F[1-9][0-9]?|route|extra|type|errorId|messagePresent|stackPresent|present|size|payloadPresent|payloadSize)$");
    }
'''
if logger.count(old_audit) != 1:
    raise SystemExit("privacy audit method anchor mismatch")
logger = logger.replace(old_audit, new_audit, 1)

LOGGER.write_text(logger, encoding="utf-8")

main = MAIN.read_text(encoding="utf-8")
old_toast = 'Toast.makeText(this, "日志导出失败", Toast.LENGTH_LONG).show();'
new_toast = '''String reason = error.getMessage();
                        if (reason == null || reason.trim().isEmpty()) reason = "未知错误（E-UNKNOWN）";
                        Toast.makeText(this, reason, Toast.LENGTH_LONG).show();'''
if main.count(old_toast) != 1:
    raise SystemExit("export toast anchor mismatch")
main = main.replace(old_toast, new_toast, 1)
MAIN.write_text(main, encoding="utf-8")

build = BUILD.read_text(encoding="utf-8")
if build.count("versionCode = 28") != 1:
    raise SystemExit("versionCode 28 baseline mismatch")
if build.count('versionName = "2.0.17-private-diagnostic"') != 1:
    raise SystemExit("versionName 2.0.17 baseline mismatch")
build = build.replace("versionCode = 28", "versionCode = 29", 1)
build = build.replace(
    'versionName = "2.0.17-private-diagnostic"',
    'versionName = "2.0.18-private-diagnostic-exportfix"',
    1,
)
BUILD.write_text(build, encoding="utf-8")

final_logger = LOGGER.read_text(encoding="utf-8")
for marker in (
    'auditDetailValue(record.opt("detail"), 0)',
    'isSafeDetailKey',
    'ClipData.newRawUri',
    'String anonymousName = "F" + (i + 1)',
):
    if marker not in final_logger:
        raise SystemExit("missing export fix marker: " + marker)

print("Applied V2 strict diagnostic export fix, versionCode=29")
