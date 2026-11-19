#include "runtime_bundle.hpp"
#include "edgeone_protocol.hpp"
#include "encrypted_transfer.hpp"
#include "html_compatibility.hpp"
#include "browser_policy.hpp"
#include "startup_coordinator.hpp"

#include <jni.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <exception>
#include <memory>
#include <limits>
#include <mutex>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

std::mutex startupRegistryMutex;
std::int64_t nextStartupHandle = 1;
std::unordered_map<std::int64_t, std::shared_ptr<gg::StartupCoordinator>> startupRegistry;

std::mutex bundleRegistryMutex;
std::int64_t nextBundleHandle = 1;
struct RegisteredBundle {
    std::shared_ptr<gg::RuntimeBundle> bundle;
    std::shared_ptr<gg::StartupCoordinator> session;
    std::int64_t ticket = 0;
};
std::unordered_map<std::int64_t, RegisteredBundle> bundleRegistry;

std::shared_ptr<gg::StartupCoordinator> lookupStartup(jlong handle) {
    std::lock_guard<std::mutex> lock(startupRegistryMutex);
    auto found = startupRegistry.find(static_cast<std::int64_t>(handle));
    return found == startupRegistry.end() ? nullptr : found->second;
}

void throwJava(JNIEnv* env, const char* className, const char* message) {
    jclass type = env->FindClass(className);
    if (type) env->ThrowNew(type, message);
}

std::string text(JNIEnv* env, jstring value) {
    if (!value) throw std::runtime_error("Missing ZIP manifest field");
    const char* utf = env->GetStringUTFChars(value, nullptr);
    if (!utf) throw std::runtime_error("Could not read ZIP manifest");
    std::string result(utf);
    env->ReleaseStringUTFChars(value, utf);
    return result;
}

std::string optionalText(JNIEnv* env, jstring value) {
    if (!value) return {};
    const char* utf = env->GetStringUTFChars(value, nullptr);
    if (!utf) throw std::runtime_error("Unable to read WebView request string");
    std::string result(utf);
    env->ReleaseStringUTFChars(value, utf);
    return result;
}

std::shared_ptr<const gg::RuntimeBundle> resolve(jlong value) {
    RegisteredBundle entry;
    {
        std::lock_guard<std::mutex> lock(bundleRegistryMutex);
        auto found = bundleRegistry.find(static_cast<std::int64_t>(value));
        if (value <= 0 || found == bundleRegistry.end()) {
            throw std::runtime_error("Runtime already disposed");
        }
        entry = found->second;
    }
    // Retaining a shared reference protects each JNI read from concurrent
    // close(). Registry IDs are never reused for another ZIP.
    if (entry.session && !entry.session->isCurrent(entry.ticket)) {
        throw std::runtime_error("Runtime authorization is obsolete");
    }
    return entry.bundle;
}

jlong openBundle(JNIEnv* env, jbyteArray input, jstring bundleSha,
        jint nonameSize, jstring nonameSha, jint gameSize, jstring gameSha,
        std::shared_ptr<gg::StartupCoordinator> session = {}, std::int64_t ticket = 0) {
    if (session && !session->isCurrent(ticket)) {
        throw std::runtime_error("Runtime authorization is obsolete");
    }
    if (!input || nonameSize <= 0 || gameSize <= 0) {
        throw std::runtime_error("Missing or invalid runtime ZIP");
    }
    const jsize count = env->GetArrayLength(input);
    if (count < 22 || count > 5'500'000) throw std::runtime_error("Runtime ZIP length invalid");
    std::vector<std::uint8_t> zip(static_cast<std::size_t>(count));
    env->GetByteArrayRegion(input, 0, count, reinterpret_cast<jbyte*>(zip.data()));
    if (env->ExceptionCheck()) {
        gg::secureClear(zip);
        return 0;
    }
    std::unique_ptr<gg::RuntimeBundle> bundle;
    try {
        bundle = gg::parseRuntimeZip(zip.data(), zip.size(),
            {static_cast<std::size_t>(nonameSize), text(env, nonameSha)},
            {static_cast<std::size_t>(gameSize), text(env, gameSha)},
            text(env, bundleSha));
    } catch (...) {
        gg::secureClear(zip);
        throw;
    }
    gg::secureClear(zip);
    if (session && !session->isCurrent(ticket)) {
        throw std::runtime_error("Runtime authorization expired during ZIP validation");
    }
    std::lock_guard<std::mutex> lock(bundleRegistryMutex);
    if (nextBundleHandle == std::numeric_limits<std::int64_t>::max()) {
        throw std::overflow_error("Runtime handle registry exhausted");
    }
    const std::int64_t id = nextBundleHandle++;
    bundleRegistry.emplace(id, RegisteredBundle{
            std::shared_ptr<gg::RuntimeBundle>(std::move(bundle)),
            std::move(session), ticket});
    return static_cast<jlong>(id);
}

template <class F>
auto translate(JNIEnv* env, F&& work) -> decltype(work()) {
    try {
        return work();
    } catch (const std::exception& error) {
        throwJava(env, "java/lang/SecurityException", error.what());
    } catch (...) {
        throwJava(env, "java/lang/SecurityException", "Native runtime rejected an unexpected input");
    }
    return {};
}

// Transfer length/network failures have historically been I/O failures in
// RuntimeZipReader; preserve the same Java caller/error handling boundary.
template <class F>
auto translateTransfer(JNIEnv* env, F&& work) -> decltype(work()) {
    try {
        return work();
    } catch (const std::exception& error) {
        throwJava(env, "java/io/IOException", error.what());
    } catch (...) {
        throwJava(env, "java/io/IOException", "Encrypted runtime transfer failed");
    }
    return {};
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_createStartupGate(JNIEnv* env, jclass) {
    return translate(env, [&]() -> jlong {
        auto gate = std::make_shared<gg::StartupCoordinator>();
        std::lock_guard<std::mutex> lock(startupRegistryMutex);
        if (nextStartupHandle == std::numeric_limits<std::int64_t>::max()) {
            throw std::overflow_error("Startup registry handles exhausted");
        }
        const std::int64_t id = nextStartupHandle++;
        startupRegistry.emplace(id, std::move(gate));
        return static_cast<jlong>(id);
    });
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_beginStartupOperation(JNIEnv* env, jclass,
        jlong handle) {
    return translate(env, [&]() -> jlong {
        auto gate = lookupStartup(handle);
        if (!gate) throw std::logic_error("Startup coordinator is closed");
        return static_cast<jlong>(gate->begin());
    });
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_isCurrentStartupOperation(JNIEnv*, jclass,
        jlong handle, jlong ticket) {
    auto gate = lookupStartup(handle);
    return gate && gate->isCurrent(ticket) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_invalidateStartupGate(JNIEnv*, jclass,
        jlong handle) {
    auto gate = lookupStartup(handle);
    if (gate) gate->invalidate();
}

extern "C" JNIEXPORT void JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_closeStartupGate(JNIEnv*, jclass,
        jlong handle) {
    std::shared_ptr<gg::StartupCoordinator> gate;
    {
        std::lock_guard<std::mutex> lock(startupRegistryMutex);
        auto found = startupRegistry.find(static_cast<std::int64_t>(handle));
        if (found == startupRegistry.end()) return;
        gate = found->second;
        // Closing before removing prevents lookups already in flight from
        // creating tickets that could outlive the owning Activity.
        gate->close();
        startupRegistry.erase(found);
    }
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_open(JNIEnv* env, jclass, jbyteArray input,
        jstring bundleSha, jint nonameSize, jstring nonameSha,
        jint gameSize, jstring gameSha) {
    return translate(env, [&]() -> jlong {
        return openBundle(env, input, bundleSha, nonameSize, nonameSha, gameSize, gameSha);
    });
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_openAuthorized(JNIEnv* env, jclass,
        jbyteArray input, jstring bundleSha, jint nonameSize, jstring nonameSha,
        jint gameSize, jstring gameSha, jlong startupHandle, jlong ticket) {
    return translate(env, [&]() -> jlong {
        auto session = lookupStartup(startupHandle);
        if (!session) throw std::runtime_error("Runtime authorization coordinator is closed");
        return openBundle(env, input, bundleSha, nonameSize, nonameSha,
                gameSize, gameSha, std::move(session), ticket);
    });
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_nonameSource(JNIEnv* env, jclass, jlong handle) {
    return translate(env, [&]() -> jstring {
        const auto bundle = resolve(handle);
        const auto& source = bundle->noname;
        // JS is UTF-8. Construct a Java String from explicit bytes to preserve
        // embedded NULs and non-ASCII text (NewStringUTF is unsuitable).
        jbyteArray array = env->NewByteArray(static_cast<jsize>(source.size()));
        if (!array) return nullptr;
        env->SetByteArrayRegion(array, 0, static_cast<jsize>(source.size()),
                                reinterpret_cast<const jbyte*>(source.data()));
        jclass stringClass = env->FindClass("java/lang/String");
        jmethodID ctor = env->GetMethodID(stringClass, "<init>", "([BLjava/lang/String;)V");
        jstring charset = env->NewStringUTF("UTF-8");
        if (env->ExceptionCheck() || !charset || !ctor) {
            env->DeleteLocalRef(array);
            return nullptr;
        }
        jobject result = env->NewObject(stringClass, ctor, array, charset);
        env->DeleteLocalRef(array);
        env->DeleteLocalRef(charset);
        return static_cast<jstring>(result);
    });
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_wrappedControlBytes(JNIEnv* env, jclass,
        jlong handle) {
    return translate(env, [&]() -> jbyteArray {
        struct WipedControl {
            std::vector<std::uint8_t> bytes;
            ~WipedControl() { gg::secureClear(bytes); }
        } wrapped;
        const auto bundle = resolve(handle);
        wrapped.bytes = gg::wrapControlScript(bundle->noname);
        jbyteArray result = env->NewByteArray(static_cast<jsize>(wrapped.bytes.size()));
        if (result) env->SetByteArrayRegion(result, 0,
            static_cast<jsize>(wrapped.bytes.size()),
            reinterpret_cast<const jbyte*>(wrapped.bytes.data()));
        return env->ExceptionCheck() ? nullptr : result;
    });
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_directEngine(JNIEnv* env, jclass,
        jboolean candidate, jstring version) {
    return translate(env, [&]() -> jboolean {
        return gg::isEdgeOneDirectEngine(candidate == JNI_TRUE,
                                          optionalText(env, version)) ? JNI_TRUE : JNI_FALSE;
    });
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_shouldReloadBrowser(JNIEnv* env, jclass,
        jboolean visible, jlong backgroundAtMs, jlong nowMs, jlong reloadDelayMs) {
    return translate(env, [&]() -> jboolean {
        return gg::shouldReloadBrowser(visible == JNI_TRUE, backgroundAtMs,
                nowMs, reloadDelayMs) ? JNI_TRUE : JNI_FALSE;
    });
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_openExternalScheme(JNIEnv* env, jclass,
        jstring scheme) {
    return translate(env, [&]() -> jboolean {
        return gg::shouldOpenExternalScheme(optionalText(env, scheme)) ? JNI_TRUE : JNI_FALSE;
    });
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_targetSiteHost(JNIEnv* env, jclass,
        jstring host) {
    return translate(env, [&]() -> jboolean {
        return gg::isTargetSiteHost(optionalText(env, host)) ? JNI_TRUE : JNI_FALSE;
    });
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_suppressedReadyAlert(JNIEnv* env, jclass,
        jstring message) {
    return translate(env, [&]() -> jboolean {
        if (!message) return JNI_FALSE;
        const jsize length = env->GetStringLength(message);
        const jchar* chars = env->GetStringChars(message, nullptr);
        if (!chars) return JNI_FALSE;
        std::u16string alert;
        try {
            alert.reserve(static_cast<std::size_t>(length));
            for (jsize i = 0; i < length; ++i) {
                alert.push_back(static_cast<char16_t>(chars[i]));
            }
        } catch (...) {
            env->ReleaseStringChars(message, chars);
            throw;
        }
        env->ReleaseStringChars(message, chars);
        return gg::isSuppressedReadyAlert(alert) ? JNI_TRUE : JNI_FALSE;
    });
}

extern "C" JNIEXPORT jint JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_resourceRoute(JNIEnv* env, jclass,
        jboolean directEngine, jstring url, jstring virtualGameUrl,
        jboolean mainFrame, jstring method, jstring scheme,
        jstring host, jstring accept) {
    return translate(env, [&]() -> jint {
        return static_cast<jint>(gg::routeWebResource(directEngine == JNI_TRUE,
            optionalText(env, url), optionalText(env, virtualGameUrl),
            mainFrame == JNI_TRUE, optionalText(env, method),
            optionalText(env, scheme), optionalText(env, host),
            optionalText(env, accept)));
    });
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_rewriteHtml(JNIEnv* env, jclass,
        jlong handle, jbyteArray htmlBytes) {
    struct WipedBytes {
        std::vector<std::uint8_t> data;
        ~WipedBytes() { gg::secureClear(data); }
    } input, rewritten;
    try {
        if (!htmlBytes) throw std::runtime_error("HTML input missing");
        const jsize length = env->GetArrayLength(htmlBytes);
        if (length < 1 || length > 6 * 1024 * 1024) {
            throw std::runtime_error("HTML length invalid");
        }
        input.data.resize(static_cast<std::size_t>(length));
        env->GetByteArrayRegion(htmlBytes, 0, length,
                                reinterpret_cast<jbyte*>(input.data.data()));
        if (env->ExceptionCheck()) return nullptr;
        const auto bundle = resolve(handle);
        rewritten.data = gg::rewriteEdgeOneHtml(input.data.data(), input.data.size(),
                                                 bundle->noname);
        auto result = env->NewByteArray(static_cast<jsize>(rewritten.data.size()));
        if (result) env->SetByteArrayRegion(result, 0,
            static_cast<jsize>(rewritten.data.size()),
            reinterpret_cast<const jbyte*>(rewritten.data.data()));
        return env->ExceptionCheck() ? nullptr : result;
    } catch (const std::exception& error) {
        throwJava(env, "java/lang/IllegalArgumentException", error.what());
        return nullptr;
    } catch (...) {
        throwJava(env, "java/lang/IllegalArgumentException", "HTML rewrite failed");
        return nullptr;
    }
}

extern "C" JNIEXPORT jint JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_copyGameRange(JNIEnv* env, jclass,
        jlong handle, jint position, jbyteArray output, jint outputOffset, jint count) {
    return translate(env, [&]() -> jint {
        if (!output || position < 0 || outputOffset < 0 || count < 1 || count > 65'536) {
            throw std::runtime_error("Invalid native engine chunk request");
        }
        const jsize length = env->GetArrayLength(output);
        if (outputOffset > length || count > length - outputOffset) {
            throw std::runtime_error("Native engine output slice out of bounds");
        }
        const auto bundle = resolve(handle);
        const auto& game = bundle->game;
        if (static_cast<std::size_t>(position) >= game.size()) return 0;
        const auto remaining = game.size() - static_cast<std::size_t>(position);
        const auto copied = static_cast<jsize>(std::min<std::size_t>(remaining,
                                            static_cast<std::size_t>(count)));
        env->SetByteArrayRegion(output, outputOffset, copied,
             reinterpret_cast<const jbyte*>(game.data() + position));
        return env->ExceptionCheck() ? 0 : copied;
    });
}

extern "C" JNIEXPORT jint JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_gameSize(JNIEnv* env, jclass, jlong handle) {
    return translate(env, [&]() -> jint {
        const auto bundle = resolve(handle);
        return static_cast<jint>(bundle->game.size());
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_close(JNIEnv*, jclass, jlong handle) {
    RegisteredBundle removed;
    {
        std::lock_guard<std::mutex> lock(bundleRegistryMutex);
        auto found = bundleRegistry.find(static_cast<std::int64_t>(handle));
        if (found == bundleRegistry.end()) return;
        removed = std::move(found->second);
        bundleRegistry.erase(found);
    }
    // Wipe outside the registry lock; another WebView can open a new runtime
    // without waiting for the old ZIP's large buffers to be zeroed.
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_beginEncryptedTransfer(JNIEnv* env, jclass,
        jint expectedBytes, jint maximumBytes) {
    return translateTransfer(env, [&]() -> jlong {
        auto transfer = std::make_unique<gg::EncryptedTransfer>(expectedBytes, maximumBytes);
        return static_cast<jlong>(reinterpret_cast<std::uintptr_t>(transfer.release()));
    });
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_beginAuthorizedEncryptedTransfer(JNIEnv* env,
        jclass, jint expectedBytes, jint maximumBytes, jlong startupHandle, jlong ticket) {
    return translateTransfer(env, [&]() -> jlong {
        auto gate = lookupStartup(startupHandle);
        if (!gate || !gate->isCurrent(ticket)) {
            throw std::runtime_error("Encrypted transfer authorization is obsolete");
        }
        auto transfer = std::make_unique<gg::EncryptedTransfer>(
            expectedBytes, maximumBytes, std::move(gate), ticket);
        return static_cast<jlong>(reinterpret_cast<std::uintptr_t>(transfer.release()));
    });
}

extern "C" JNIEXPORT jint JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_appendEncryptedTransfer(JNIEnv* env, jclass,
        jlong handle, jbyteArray source, jint offset, jint count) {
    return translateTransfer(env, [&]() -> jint {
        if (!handle || !source || offset < 0 || count < 1 || count > 8192) {
            throw std::runtime_error("Invalid encrypted transfer chunk");
        }
        const jsize length = env->GetArrayLength(source);
        if (offset > length || count > length - offset) {
            throw std::runtime_error("Encrypted transfer source slice out of bounds");
        }
        std::array<std::uint8_t, 8192> chunk{};
        env->GetByteArrayRegion(source, offset, count, reinterpret_cast<jbyte*>(chunk.data()));
        if (env->ExceptionCheck()) return 0;
        // The source contains encrypted ciphertext only; the native buffer
        // owns a separate copy until finish/release, even on early failure.
        const int received = reinterpret_cast<gg::EncryptedTransfer*>(
            static_cast<std::uintptr_t>(handle))->append(chunk.data(),
                                                         static_cast<std::size_t>(count));
        std::fill(chunk.begin(), chunk.end(), 0);
        return received;
    });
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_finishEncryptedTransfer(JNIEnv* env, jclass,
        jlong handle) {
    return translateTransfer(env, [&]() -> jbyteArray {
        if (!handle) throw std::runtime_error("Missing encrypted transfer");
        const auto& data = reinterpret_cast<gg::EncryptedTransfer*>(
            static_cast<std::uintptr_t>(handle))->finish();
        auto output = env->NewByteArray(static_cast<jsize>(data.size()));
        if (output) env->SetByteArrayRegion(output, 0, static_cast<jsize>(data.size()),
                                           reinterpret_cast<const jbyte*>(data.data()));
        return env->ExceptionCheck() ? nullptr : output;
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_releaseEncryptedTransfer(JNIEnv*, jclass,
        jlong handle) {
    delete reinterpret_cast<gg::EncryptedTransfer*>(static_cast<std::uintptr_t>(handle));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_proofCanonical(JNIEnv* env, jclass,
        jstring action, jlong now, jstring deviceId, jstring material) {
    return translate(env, [&]() -> jstring {
        const std::string canonical = gg::proofCanonical(
            text(env, action), static_cast<std::int64_t>(now),
            text(env, deviceId), text(env, material));
        return env->NewStringUTF(canonical.c_str());
    });
}

extern "C" JNIEXPORT jint JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_savedAuthPlan(JNIEnv* env, jclass,
        jstring key, jstring token) {
    return translate(env, [&]() -> jint {
        return gg::savedAuthPlan(text(env, key), text(env, token));
    });
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_normalizeLicenseKey(JNIEnv* env, jclass,
        jstring rawLicense) {
    return translate(env, [&]() -> jstring {
        const std::string normalized = gg::normalizeLicenseKey(rawLicense
            ? text(env, rawLicense) : "");
        return env->NewStringUTF(normalized.c_str());
    });
}

extern "C" JNIEXPORT jint JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_authorizationStart(JNIEnv* env, jclass,
        jstring key, jstring token, jboolean manualActivation) {
    return translate(env, [&]() -> jint {
        return gg::authorizationStart(key ? text(env, key) : "",
            token ? text(env, token) : "", manualActivation == JNI_TRUE);
    });
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_shouldDownloadRuntime(JNIEnv* env, jclass,
        jboolean forceUpdate, jint latestAppVersion, jint currentAppVersion) {
    return translate(env, [&]() -> jboolean {
        return gg::shouldDownloadRuntime(forceUpdate == JNI_TRUE,
                    latestAppVersion, currentAppVersion) ? JNI_TRUE : JNI_FALSE;
    });
}

extern "C" JNIEXPORT jint JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_startupPresentation(JNIEnv*, jclass,
        jboolean valid, jboolean hasRuntime, jboolean updateRequired) {
    return gg::startupPresentation(valid == JNI_TRUE, hasRuntime == JNI_TRUE,
                                    updateRequired == JNI_TRUE);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_initializationPercent(JNIEnv*, jclass,
        jint received, jint expected) {
    return gg::initializationPercent(received, expected);
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_shouldReactivate(JNIEnv* env, jclass,
        jstring errorCode) {
    return translate(env, [&]() -> jboolean {
        return gg::shouldReactivate(text(env, errorCode)) ? JNI_TRUE : JNI_FALSE;
    });
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_officialApkSignerMatches(JNIEnv* env, jclass,
        jstring certificateSha256) {
    return translate(env, [&]() -> jboolean {
        return gg::officialApkSignerMatches(text(env, certificateSha256))
                ? JNI_TRUE : JNI_FALSE;
    });
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_signedRequestJson(JNIEnv* env, jclass,
        jstring action, jstring deviceId, jstring devicePublicKey,
        jlong requestTime, jstring proof, jstring credential, jstring deliveryPublicKey) {
    return translate(env, [&]() -> jstring {
        const std::string json = gg::signedRequestJson(text(env, action), text(env, deviceId),
            text(env, devicePublicKey), static_cast<std::int64_t>(requestTime),
            text(env, proof), text(env, credential), text(env, deliveryPublicKey));
        return env->NewStringUTF(json.c_str());
    });
}

extern "C" JNIEXPORT jint JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_classifyApiResponse(JNIEnv* env, jclass,
        jstring action, jint httpStatus, jboolean bodyOk) {
    return translate(env, [&]() -> jint {
        return gg::classifyApiResponse(text(env, action), httpStatus, bodyOk == JNI_TRUE);
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_validateAuthResponse(JNIEnv* env, jclass,
        jstring token, jlong expiresAt, jboolean permanent, jint latestAppVersion) {
    translate(env, [&]() -> bool {
        gg::validateAuthResponse(text(env, token), expiresAt,
                                 permanent == JNI_TRUE, latestAppVersion);
        return true;
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_validateDeliveryHeaders(JNIEnv* env, jclass,
        jstring version, jstring serverKey, jstring iv, jstring manifest, jstring sha) {
    translate(env, [&]() -> bool {
        gg::validateDeliveryHeaders(text(env, version), text(env, serverKey),
                                    text(env, iv), text(env, manifest), text(env, sha));
        return true;
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_validateDeliveryManifest(JNIEnv* env, jclass,
        jint size, jstring manifestSha, jint nonameSize, jstring nonameSha,
        jint gameSize, jstring gameSha, jstring headerSha) {
    translate(env, [&]() -> bool {
        gg::validateDeliveryManifest(size, text(env, manifestSha), nonameSize,
                                     text(env, nonameSha), gameSize, text(env, gameSha),
                                     text(env, headerSha));
        return true;
    });
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_deliveryMaterial(JNIEnv* env, jclass,
        jbyteArray sharedInput, jstring deviceId, jstring token) {
    return translate(env, [&]() -> jobjectArray {
        if (!sharedInput || env->GetArrayLength(sharedInput) != 32) {
            throw std::runtime_error("Invalid P-256 shared secret");
        }
        struct WipedShared {
            std::array<std::uint8_t, 32> bytes{};
            ~WipedShared() {
                volatile std::uint8_t* p = bytes.data();
                for (std::size_t i = 0; i < bytes.size(); ++i) p[i] = 0;
            }
        } shared;
        env->GetByteArrayRegion(sharedInput, 0, 32, reinterpret_cast<jbyte*>(shared.bytes.data()));
        if (env->ExceptionCheck()) return nullptr;
        gg::DeliveryMaterial derived = gg::deriveDeliveryMaterial(
            shared.bytes.data(), shared.bytes.size(), text(env, deviceId), text(env, token));
        jclass bytesClass = env->FindClass("[B");
        if (!bytesClass) return nullptr;
        jobjectArray output = env->NewObjectArray(2, bytesClass, nullptr);
        if (!output) return nullptr;
        jbyteArray key = env->NewByteArray(static_cast<jsize>(derived.key.size()));
        jbyteArray aad = env->NewByteArray(static_cast<jsize>(derived.aad.size()));
        if (!key || !aad) return nullptr;
        env->SetByteArrayRegion(key, 0, static_cast<jsize>(derived.key.size()),
                                reinterpret_cast<const jbyte*>(derived.key.data()));
        env->SetByteArrayRegion(aad, 0, static_cast<jsize>(derived.aad.size()),
                                reinterpret_cast<const jbyte*>(derived.aad.data()));
        if (!env->ExceptionCheck()) {
            env->SetObjectArrayElement(output, 0, key);
            env->SetObjectArrayElement(output, 1, aad);
        }
        env->DeleteLocalRef(key);
        env->DeleteLocalRef(aad);
        return output;
    });
}
