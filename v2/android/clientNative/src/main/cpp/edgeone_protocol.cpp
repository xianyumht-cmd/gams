#include "edgeone_protocol.hpp"
#include "runtime_bundle.hpp"

#include <algorithm>
#include <array>
#include <cstring>
#include <stdexcept>

namespace gg {
namespace {

bool validAscii(const std::string& value, const std::string& alphabet,
                std::size_t minimum, std::size_t maximum) {
    return value.size() >= minimum && value.size() <= maximum &&
           value.find_first_not_of(alphabet) == std::string::npos;
}

constexpr char kHexUpper[] = "0123456789ABCDEF";
constexpr char kHexLower[] = "0123456789abcdef";
constexpr char kBase64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
constexpr char kToken[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-";

void wipe(std::uint8_t* bytes, std::size_t length) noexcept {
    volatile std::uint8_t* p = bytes;
    for (std::size_t i = 0; i < length; ++i) p[i] = 0;
}

std::array<std::uint8_t, 32> hmacSha256(
    const std::uint8_t* key, std::size_t keyLength,
    const std::uint8_t* message, std::size_t messageLength) {
    std::array<std::uint8_t, 64> innerPad{};
    std::array<std::uint8_t, 64> outerPad{};
    if (keyLength > innerPad.size()) {
        auto hashed = sha256Digest(key, keyLength);
        std::memcpy(innerPad.data(), hashed.data(), hashed.size());
        wipe(hashed.data(), hashed.size());
    } else {
        std::memcpy(innerPad.data(), key, keyLength);
    }
    std::copy(innerPad.begin(), innerPad.end(), outerPad.begin());
    for (auto& value : innerPad) value ^= 0x36;
    for (auto& value : outerPad) value ^= 0x5c;
    std::vector<std::uint8_t> inner(innerPad.begin(), innerPad.end());
    inner.insert(inner.end(), message, message + messageLength);
    auto innerDigest = sha256Digest(inner.data(), inner.size());
    std::vector<std::uint8_t> outer(outerPad.begin(), outerPad.end());
    outer.insert(outer.end(), innerDigest.begin(), innerDigest.end());
    auto digest = sha256Digest(outer.data(), outer.size());
    secureClear(inner);
    secureClear(outer);
    wipe(innerPad.data(), innerPad.size());
    wipe(outerPad.data(), outerPad.size());
    wipe(innerDigest.data(), innerDigest.size());
    return digest;
}

}  // namespace

DeliveryMaterial::~DeliveryMaterial() {
    wipe(key.data(), key.size());
    secureClear(aad);
}

DeliveryMaterial::DeliveryMaterial(DeliveryMaterial&& other) noexcept
    : key(other.key), aad(std::move(other.aad)) {
    wipe(other.key.data(), other.key.size());
}

std::string proofCanonical(const std::string& action, std::int64_t epochSeconds,
                           const std::string& deviceId, const std::string& material) {
    if (action.empty() || action.size() > 64 || deviceId.size() != 64 ||
        material.size() > 8192 || epochSeconds <= 0) {
        throw std::runtime_error("Invalid license proof material");
    }
    const auto bytes = reinterpret_cast<const std::uint8_t*>(material.data());
    return action + "\n" + std::to_string(epochSeconds) + "\n" + deviceId + "\n" +
           sha256Hex(bytes, material.size());
}

int savedAuthPlan(const std::string& normalizedLicense, const std::string& savedToken) {
    if (!validAscii(normalizedLicense, kHexUpper, 32, 32)) return 0;
    // A damaged saved session previously produced `bad_session` then activated
    // again. Recover locally instead of rejecting during native JSON shaping.
    return validAscii(savedToken, kToken, 10, 1600) ? 2 : 1;
}

bool shouldReactivate(const std::string& errorCode) {
    return errorCode == "bad_session" || errorCode == "device_unbound";
}

std::string signedRequestJson(const std::string& action,
                              const std::string& deviceId,
                              const std::string& devicePublicKey,
                              std::int64_t requestTime,
                              const std::string& proof,
                              const std::string& credential,
                              const std::string& deliveryPublicKey) {
    if (!validAscii(deviceId, kHexLower, 64, 64) ||
        !validAscii(devicePublicKey, kBase64, 80, 1000) ||
        !validAscii(proof, kBase64, 80, 200) || requestTime <= 0) {
        throw std::runtime_error("Invalid signed request identity");
    }
    std::string additional;
    if (action == "activate") {
        if (!validAscii(credential, kHexUpper, 32, 32) || !deliveryPublicKey.empty())
            throw std::runtime_error("Invalid activation credential");
        additional = ",\"licenseKey\":\"" + credential + "\"";
    } else if (action == "check" || action == "unbind" || action == "runtime-v2") {
        if (!validAscii(credential, kToken, 10, 1600))
            throw std::runtime_error("Invalid session token");
        additional = ",\"token\":\"" + credential + "\"";
        if (action == "runtime-v2") {
            if (!validAscii(deliveryPublicKey, kBase64, 80, 1000))
                throw std::runtime_error("Invalid one-use delivery key");
            additional += ",\"deliveryPublicKey\":\"" + deliveryPublicKey + "\"";
        } else if (!deliveryPublicKey.empty()) {
            throw std::runtime_error("Unexpected delivery key");
        }
    } else {
        throw std::runtime_error("Unsupported license action");
    }
    return "{\"deviceId\":\"" + deviceId + "\",\"devicePublicKey\":\"" +
           devicePublicKey + "\",\"requestTime\":" + std::to_string(requestTime) +
           ",\"proof\":\"" + proof + "\"" + additional + "}";
}

DeliveryMaterial deriveDeliveryMaterial(const std::uint8_t* shared, std::size_t length,
                                         const std::string& deviceId,
                                         const std::string& token) {
    if (!shared || length != 32 || deviceId.size() != 64 || token.empty() ||
        token.size() > 4096) {
        throw std::runtime_error("Invalid EdgeOne delivery material");
    }
    constexpr char salt[] = "gg-edgeone-v2";
    const auto tokenHash = sha256Hex(
        reinterpret_cast<const std::uint8_t*>(token.data()), token.size());
    const auto info = "gg-edgeone-runtime-v2|" + deviceId + "|" + tokenHash;
    auto prk = hmacSha256(reinterpret_cast<const std::uint8_t*>(salt), sizeof(salt) - 1,
                          shared, length);
    std::vector<std::uint8_t> expand(info.begin(), info.end());
    expand.push_back(1);
    DeliveryMaterial result;
    result.key = hmacSha256(prk.data(), prk.size(), expand.data(), expand.size());
    result.aad.assign(info.begin(), info.end());
    wipe(prk.data(), prk.size());
    secureClear(expand);
    return result;
}

}  // namespace gg
