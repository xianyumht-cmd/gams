#include "runtime_bundle.hpp"

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
        jint nonameSize, jstring nonameSha, jint gameSize, jstring gameSha) {
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
                {static_cast<std::size_t>(gameSize), text(env, gameSha)});
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
