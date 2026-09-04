from pathlib import Path

path = Path("license-api/src/index.js")
text = path.read_text(encoding="utf-8")

old_challenge = '''  if (!deviceHash || !["activate", "check", "unbind"].includes(purpose)) {
    throw new HttpError(400, "bad_request", "设备验证信息无效");
  }'''
new_challenge = '''  if (!deviceHash) {
    throw new HttpError(400, "bad_device_id", "设备标识格式无效");
  }
  if (!["activate", "check", "unbind"].includes(purpose)) {
    throw new HttpError(400, "bad_purpose", "设备验证用途无效");
  }'''

old_signed = '''  if (!deviceHash || purpose !== expectedPurpose || !nonce || !Number.isFinite(timestamp)
      || !keyFingerprint || !certificateDigest || !payloadHash || !signature) {
    throw new HttpError(400, "bad_signature_request", "设备验证信息无效");
  }'''
new_signed = '''  if (!deviceHash) throw new HttpError(400, "bad_device_id", "设备标识格式无效");
  if (purpose !== expectedPurpose) throw new HttpError(400, "bad_purpose", "设备验证用途无效");
  if (!nonce) throw new HttpError(400, "bad_nonce", "设备验证随机码无效");
  if (!Number.isFinite(timestamp)) throw new HttpError(400, "bad_timestamp", "设备验证时间无效");
  if (!keyFingerprint) throw new HttpError(400, "bad_key_fingerprint", "设备公钥指纹无效");
  if (!certificateDigest) throw new HttpError(400, "bad_certificate_digest", "客户端签名摘要无效");
  if (!payloadHash) throw new HttpError(400, "bad_payload_hash", "设备验证数据摘要无效");
  if (!signature) throw new HttpError(400, "bad_signature_field", "设备签名字段无效");'''

if text.count(old_challenge) != 1:
    raise SystemExit(f"challenge block count={text.count(old_challenge)}")
if text.count(old_signed) != 1:
    raise SystemExit(f"signed block count={text.count(old_signed)}")

text = text.replace(old_challenge, new_challenge).replace(old_signed, new_signed)
path.write_text(text, encoding="utf-8")
print("device validation diagnostics applied")
