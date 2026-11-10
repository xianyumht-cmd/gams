#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace gg {

// Canonical request bytes MUST exactly match the existing EdgeOne Node server.
std::string proofCanonical(const std::string& action, std::int64_t epochSeconds,
                           const std::string& deviceId, const std::string& material);

struct DeliveryMaterial {
    std::array<std::uint8_t, 32> key{};
    std::vector<std::uint8_t> aad;

    ~DeliveryMaterial();
    DeliveryMaterial() = default;
    DeliveryMaterial(DeliveryMaterial&& other) noexcept;
    DeliveryMaterial(const DeliveryMaterial&) = delete;
    DeliveryMaterial& operator=(const DeliveryMaterial&) = delete;
};

// HKDF-SHA256(salt = "gg-edgeone-v2", IKM = one-use P-256 ECDH shared secret,
// info = "gg-edgeone-runtime-v2|" + deviceId + "|" + hex(SHA256(token))).
// First 32 bytes are the AES-256-GCM key, and info is its AAD.
DeliveryMaterial deriveDeliveryMaterial(const std::uint8_t* shared, std::size_t length,
                                         const std::string& deviceId,
                                         const std::string& token);

}  // namespace gg
