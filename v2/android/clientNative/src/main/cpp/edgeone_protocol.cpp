#include "edgeone_protocol.hpp"
#include "runtime_bundle.hpp"

#include <algorithm>
#include <array>
#include <cstring>
#include <stdexcept>

namespace gg {
namespace {

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
