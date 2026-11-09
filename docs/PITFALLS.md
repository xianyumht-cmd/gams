# 构建与开发陷阱

## Android 测试变体覆盖主清单属性

- 发现：2026-11-10，`GG Local JS Test APK` 首轮 Actions 在 `:client:processLocalTestMainManifest` 失败；测试变体的 `android:label="GG 本地测试"` 与主清单的 `android:label="GG"` 冲突。
- 原因：`src/localTest/AndroidManifest.xml` 不是替换整个主清单，覆盖已有 `application` 属性时需要明确的 Manifest Merger 规则。
- 防止：在变体清单中声明 `xmlns:tools` 并为目标属性使用 `tools:replace="android:label"`；保留 `scripts/test_local_js_variant.py` 的静态检查和 Actions 真正的 `assembleLocalTest` 验证。
