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
constexpr char kBase64Url[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

bool strictBase64(const std::string& input, std::size_t minimum, std::size_t maximum,
                  std::size_t* decodedSize = nullptr) {
    if (input.size() < minimum || input.size() > maximum || input.size() % 4 != 0 ||
        !validAscii(input, kBase64, minimum, maximum)) return false;
    const auto firstPad = input.find('=');
    const auto padding = firstPad == std::string::npos ? 0 : input.size() - firstPad;
    if (padding > 2) return false;
    // A padding character must be part of the final quartet, and a single
    // trailing base64 character cannot encode a complete byte.
    if (padding == 1 && (input[input.size() - 2] == '=')) return false;
    if (decodedSize) *decodedSize = input.size() / 4 * 3 - padding;
    return true;
}

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

std::string normalizeLicenseKey(const std::string& rawLicense) {
    // Java's /[^0-9A-Fa-f]/g filters ASCII only, then uppercases with Locale.ROOT.
    // Reject implausibly long corrupted preferences instead of buffering them.
    if (rawLicense.size() > 8192) return {};
    std::string result;
    result.reserve(std::min<std::size_t>(rawLicense.size(), 33));
    for (const char ch : rawLicense) {
        if (ch >= '0' && ch <= '9') result.push_back(ch);
        else if (ch >= 'A' && ch <= 'F') result.push_back(ch);
        else if (ch >= 'a' && ch <= 'f') result.push_back(static_cast<char>(ch - 'a' + 'A'));
        if (result.size() > 32) return result; // An oversized license is invalid.
    }
    return result;
}

int authorizationStart(const std::string& rawLicense, const std::string& savedToken,
                       bool manualActivation) {
    if (!validAscii(normalizeLicenseKey(rawLicense), kHexUpper, 32, 32)) return 0;
    if (manualActivation) return 1;
    // A damaged saved session previously produced `bad_session` then activated
    // again. Recover locally instead of rejecting during native JSON shaping.
    return validAscii(savedToken, kToken, 10, 1600) ? 2 : 1;
}

int savedAuthPlan(const std::string& normalizedLicense, const std::string& savedToken) {
    return authorizationStart(normalizedLicense, savedToken, false);
}

bool shouldReactivate(const std::string& errorCode) {
    return errorCode == "bad_session" || errorCode == "device_unbound";
}

bool shouldDownloadRuntime(bool forceUpdate, int latestVersion, int clientVersion) {
    if (latestVersion <= 0 || clientVersion <= 0) {
        throw std::runtime_error("Invalid app version in authorization policy");
    }
    return !forceUpdate || latestVersion <= clientVersion;
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

int classifyApiResponse(const std::string& action, int httpStatus, bool bodyOk) {
    if (action != "activate" && action != "check" && action != "unbind") {
        throw std::runtime_error("Unexpected license response action");
    }
    if (httpStatus < 200 || httpStatus >= 300) return 1;
    return bodyOk ? 0 : 2;
}

void validateAuthResponse(const std::string& sessionToken, std::int64_t licenseExpiresAt,
                          bool permanent, int latestAppVersion) {
    (void) permanent;  // The server may preserve a historical expiry on a permanent record.
    const auto separator = sessionToken.find('.');
    if (separator == std::string::npos || separator == 0 ||
        separator > 1535 || sessionToken.find('.', separator + 1) != std::string::npos ||
        !validAscii(sessionToken.substr(0, separator), kBase64Url, 1, 1535) ||
        !validAscii(sessionToken.substr(separator + 1), kHexLower, 64, 64) ||
        sessionToken.size() > 1600 || licenseExpiresAt < 0 || latestAppVersion <= 0) {
        throw std::runtime_error("Invalid authorization session response");
    }
}

void validateDeliveryHeaders(const std::string& version, const std::string& serverKey,
                             const std::string& iv, const std::string& manifestBase64,
                             const std::string& bundleSha) {
    std::size_t serverKeyLength = 0;
    std::size_t ivLength = 0;
    if (version != "2" || !strictBase64(serverKey, 100, 300, &serverKeyLength) ||
        serverKeyLength < 70 || serverKeyLength > 200 ||
        !strictBase64(iv, 16, 64, &ivLength) || ivLength != 12 ||
        !strictBase64(manifestBase64, 8, 4096) ||
        !validAscii(bundleSha, kHexLower, 64, 64)) {
        throw std::runtime_error("Invalid encrypted runtime delivery headers");
    }
}

void validateDeliveryManifest(int archiveSize, const std::string& manifestSha,
                              int nonameSize, const std::string& nonameSha,
                              int gameSize, const std::string& gameSha,
                              const std::string& headerSha) {
    if (archiveSize < 1 || archiveSize > 5'500'000 ||
        nonameSize < 1 || nonameSize > 2 * 1024 * 1024 ||
        gameSize < 1 || gameSize > 16 * 1024 * 1024 ||
        !validAscii(headerSha, kHexLower, 64, 64) || manifestSha != headerSha ||
        !validAscii(nonameSha, kHexLower, 64, 64) ||
        !validAscii(gameSha, kHexLower, 64, 64)) {
        throw std::runtime_error("Invalid encrypted runtime manifest");
    }
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
