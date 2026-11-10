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

// Saved credential plan: 0 = missing/invalid key; 1 = activate; 2 = check.
int savedAuthPlan(const std::string& normalizedLicense, const std::string& savedToken);
bool shouldReactivate(const std::string& errorCode);

// Native startup policy: preserve the Java license-field normalization and
// decide between invalid input (0), activation (1), and existing-session check
// (2) without moving Android Keystore/network/async callbacks out of Java.
std::string normalizeLicenseKey(const std::string& rawLicense);
int authorizationStart(const std::string& rawLicense, const std::string& savedToken,
                       bool manualActivation);
// False means the server requires an app upgrade, so never request the JS ZIP.
bool shouldDownloadRuntime(bool forceUpdate, int latestVersion, int clientVersion);

// Main-thread startup outcome after auth + optional runtime delivery.
// 0 = show activation form/error, 1 = open WebView, 2 = show mandatory update.
// A payload that is not selected for WebView must be disposed by the caller.
int startupPresentation(bool valid, bool hasRuntime, bool updateRequired);

// Preserve Java RuntimeZipReader.displayPercent for the native candidate:
// 0 while awaiting bytes and at most 90 before ZIP/JCA/WebView verification.
int initializationPercent(int received, int expected);

// Full HTTP JSON body, using only already-validated ASCII protocol fields.
// Actions: activate, check, unbind, runtime-v2. Wire paths stay in Java.
std::string signedRequestJson(const std::string& action,
                              const std::string& deviceId,
                              const std::string& devicePublicKey,
                              std::int64_t requestTime,
                              const std::string& proof,
                              const std::string& credential,
                              const std::string& deliveryPublicKey);

// Inbound wire policy. The Android HTTP/JSON adapter only transports bytes and
// projects typed fields; these decisions belong to the native candidate.
// Return 0 for success, 1 for rejected HTTP status, 2 for a rejected JSON body.
int classifyApiResponse(const std::string& action, int httpStatus, bool bodyOk);
void validateAuthResponse(const std::string& sessionToken, std::int64_t licenseExpiresAt,
                          bool permanent, int latestAppVersion);
void validateDeliveryHeaders(const std::string& version, const std::string& serverKey,
                             const std::string& iv, const std::string& manifestBase64,
                             const std::string& bundleSha);
void validateDeliveryManifest(int archiveSize, const std::string& manifestSha,
                              int nonameSize, const std::string& nonameSha,
                              int gameSize, const std::string& gameSha,
                              const std::string& headerSha);

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
