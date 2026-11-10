#include "runtime_bundle.hpp"
#include "edgeone_protocol.hpp"

#include <jni.h>

#include <cstdint>
#include <exception>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

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

gg::RuntimeBundle* resolve(jlong value) {
    if (value == 0) throw std::runtime_error("Runtime already disposed");
    return reinterpret_cast<gg::RuntimeBundle*>(static_cast<std::uintptr_t>(value));
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

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_open(JNIEnv* env, jclass, jbyteArray input,
        jstring bundleSha, jint nonameSize, jstring nonameSha,
        jint gameSize, jstring gameSha) {
    return translate(env, [&]() -> jlong {
        if (!input || nonameSize <= 0 || gameSize <= 0) {
            throw std::runtime_error("Missing or invalid runtime ZIP");
        }
        const jsize count = env->GetArrayLength(input);
        if (count < 22 || count > 5'500'000) throw std::runtime_error("Runtime ZIP length invalid");
        std::vector<std::uint8_t> zip(static_cast<std::size_t>(count));
        env->GetByteArrayRegion(input, 0, count, reinterpret_cast<jbyte*>(zip.data()));
        if (env->ExceptionCheck()) return 0;
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
        return static_cast<jlong>(reinterpret_cast<std::uintptr_t>(bundle.release()));
    });
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_nonameSource(JNIEnv* env, jclass, jlong handle) {
    return translate(env, [&]() -> jstring {
        const auto& source = resolve(handle)->noname;
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
Java_com_jinli_ggsecure_NativeRuntimeBridge_gameBytes(JNIEnv* env, jclass, jlong handle) {
    return translate(env, [&]() -> jbyteArray {
        const auto& game = resolve(handle)->game;
        jbyteArray result = env->NewByteArray(static_cast<jsize>(game.size()));
        if (result) env->SetByteArrayRegion(result, 0, static_cast<jsize>(game.size()),
                                            reinterpret_cast<const jbyte*>(game.data()));
        return result;
    });
}

extern "C" JNIEXPORT jint JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_gameSize(JNIEnv* env, jclass, jlong handle) {
    return translate(env, [&]() -> jint {
        return static_cast<jint>(resolve(handle)->game.size());
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_close(JNIEnv*, jclass, jlong handle) {
    delete reinterpret_cast<gg::RuntimeBundle*>(static_cast<std::uintptr_t>(handle));
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

extern "C" JNIEXPORT jboolean JNICALL
Java_com_jinli_ggsecure_NativeRuntimeBridge_shouldReactivate(JNIEnv* env, jclass,
        jstring errorCode) {
    return translate(env, [&]() -> jboolean {
        return gg::shouldReactivate(text(env, errorCode)) ? JNI_TRUE : JNI_FALSE;
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
