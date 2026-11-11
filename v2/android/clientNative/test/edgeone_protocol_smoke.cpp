#include "../src/main/cpp/edgeone_protocol.hpp"
#include "../src/main/cpp/encrypted_transfer.hpp"
#include "../src/main/cpp/startup_coordinator.hpp"

#include <array>
#include <cstdint>
#include <functional>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>

void rejects(const std::function<void()>& action) {
    try { action(); } catch (const std::runtime_error&) { return; }
    throw std::runtime_error("Protocol accepted invalid input");
}

std::string hex(const std::array<std::uint8_t, 32>& input) {
    constexpr char digits[] = "0123456789abcdef";
    std::string result;
    for (auto byte : input) {
        result += digits[byte >> 4];
        result += digits[byte & 15];
    }
    return result;
}

int main() {
    std::string device;
    for (int i = 0; i < 32; ++i) device += "ab";
    const std::string expectedProof = "activate\n1794344400\n" + device +
        "\n1c1181e7f8dece465e066361d49886efa49b372e3e029fcdf21b9621e4021366";
    if (gg::proofCanonical("activate", 1794344400, device, "ABCDEF0123456789") != expectedProof)
        throw std::runtime_error("C++ proof mismatches the Node reference");
    const std::string license = "0123456789ABCDEF0123456789ABCDEF";
    if (gg::normalizeLicenseKey("01-23 45:67:89 ab cd ef 0123456789abcdef") != license ||
        gg::normalizeLicenseKey("ＧＧ12☃ab") != "12AB" ||
        gg::normalizeLicenseKey(std::string(8193, 'A')) != "") {
        throw std::runtime_error("Native card normalizer diverges from Java ASCII filter");
    }
    if (gg::authorizationStart(license, "", false) != 1 ||
        gg::authorizationStart(license, "savedtoken.value", false) != 2 ||
        gg::authorizationStart(license, "savedtoken.value", true) != 1 ||
        gg::authorizationStart("invalid", "savedtoken.value", true) != 0 ||
        gg::authorizationStart(license, "bad", false) != 1) {
        throw std::runtime_error("Native initial activation/check state diverges from Java");
    }
    if (!gg::shouldDownloadRuntime(false, 15, 12) ||
        !gg::shouldDownloadRuntime(true, 12, 12) ||
        !gg::shouldDownloadRuntime(true, 11, 12) ||
        gg::shouldDownloadRuntime(true, 13, 12)) {
        throw std::runtime_error("Native upgrade gate allowed a mandatory client update");
    }
    rejects([&] { gg::shouldDownloadRuntime(true, 12, 0); });
    if (gg::startupPresentation(true, true, false) != 1 ||
        gg::startupPresentation(false, false, false) != 0 ||
        gg::startupPresentation(true, false, false) != 0 ||
        gg::startupPresentation(false, true, false) != 0 ||
        gg::startupPresentation(false, false, true) != 2 ||
        gg::startupPresentation(true, true, true) != 2) {
        throw std::runtime_error("Native startup result presentation policy mismatch");
    }
    if (gg::initializationPercent(0, 500) != 0 ||
        gg::initializationPercent(1, 500) != 0 ||
        gg::initializationPercent(250, 500) != 45 ||
        gg::initializationPercent(499, 500) != 89 ||
        gg::initializationPercent(500, 500) != 90 ||
        gg::initializationPercent(700, 500) != 90 ||
        gg::initializationPercent(50, 0) != 0 ||
        gg::initializationPercent(-1, 500) != 0 ||
        gg::initializationPercent(2'147'483'647, 2'147'483'647) != 90) {
        throw std::runtime_error("Native initialization progress diverges from Java");
    }
    const std::string pub(124, 'A');
    const std::string proof(88, 'B');
    if (gg::savedAuthPlan(license, "") != 1 ||
        gg::savedAuthPlan(license, "validtoken.value") != 2 ||
        gg::savedAuthPlan(license, "a.b") != 1 ||
        gg::savedAuthPlan("short", "") != 0 ||
        !gg::shouldReactivate("bad_session") ||
        !gg::shouldReactivate("device_unbound") ||
        gg::shouldReactivate("device_limit") ||
        gg::shouldReactivate("license_expired")) {
        throw std::runtime_error("Native saved-license policy mismatches Java");
    }
    const std::string prefix = "{\"deviceId\":\"" + device +
        "\",\"devicePublicKey\":\"" + pub +
        "\",\"requestTime\":1794344400,\"proof\":\"" + proof + "\"";
    if (gg::signedRequestJson("activate", device, pub, 1794344400, proof, license, "") !=
            prefix + ",\"licenseKey\":\"" + license + "\"}" ||
        gg::signedRequestJson("check", device, pub, 1794344400, proof, "aaabbb.cccddd", "") !=
            prefix + ",\"token\":\"aaabbb.cccddd\"}" ||
        gg::signedRequestJson("unbind", device, pub, 1794344400, proof, "aaabbb.cccddd", "") !=
            prefix + ",\"token\":\"aaabbb.cccddd\"}" ||
        gg::signedRequestJson("runtime-v2", device, pub, 1794344400, proof,
                              "aaabbb.cccddd", pub) != prefix +
            ",\"token\":\"aaabbb.cccddd\",\"deliveryPublicKey\":\"" + pub + "\"}") {
        throw std::runtime_error("Native EdgeOne JSON diverges from Java wire schema");
    }
    rejects([&] { gg::signedRequestJson("runtime-v2", device, pub, 1794344400,
                                         proof, "aaabbb.cccddd", ""); });
    rejects([&] { gg::signedRequestJson("activate", device, pub, 1794344400,
                                         proof, license + "\"", ""); });
    rejects([&] { gg::signedRequestJson("check", device, pub, 1794344400,
                                         proof, "a\"b.c", ""); });
    // Both successful and unsuccessful HTTP/JSON replies exercise the native
    // inbound policy. An HTTP 200 carrying `ok:false` must never be accepted.
    if (gg::classifyApiResponse("activate", 200, true) != 0 ||
        gg::classifyApiResponse("check", 201, true) != 0 ||
        gg::classifyApiResponse("unbind", 200, true) != 0 ||
        gg::classifyApiResponse("check", 200, false) != 2 ||
        gg::classifyApiResponse("activate", 401, true) != 1) {
        throw std::runtime_error("Native response policy accepted a failed response");
    }
    rejects([&] { gg::classifyApiResponse("runtime", 200, true); });
    const std::string token = std::string(160, 'A') + "." + std::string(64, 'a');
    gg::validateAuthResponse(token, 0, true, 12);
    gg::validateAuthResponse(token, 1794444400, false, 12);
    rejects([&] { gg::validateAuthResponse("a.b", 0, true, 12); });
    rejects([&] { gg::validateAuthResponse(token + ".extra", 0, true, 12); });
    rejects([&] { gg::validateAuthResponse(token, -1, false, 12); });
    rejects([&] { gg::validateAuthResponse(token, 0, false, 0); });
    const std::string hash(64, 'a');
    const std::string serverKey(124, 'A');
    const std::string iv(16, 'A');
    const std::string manifest(32, 'A');
    gg::validateDeliveryHeaders("2", serverKey, iv, manifest, hash);
    gg::validateDeliveryManifest(5120, hash, 500, hash, 4000, hash, hash);
    rejects([&] { gg::validateDeliveryHeaders("1", serverKey, iv, manifest, hash); });
    rejects([&] { gg::validateDeliveryHeaders("2", serverKey, "A=AA" + iv, manifest, hash); });
    rejects([&] { gg::validateDeliveryHeaders("2", serverKey, iv, manifest, std::string(64, 'A')); });
    rejects([&] { gg::validateDeliveryManifest(5'500'001, hash, 500, hash, 4000, hash, hash); });
    rejects([&] { gg::validateDeliveryManifest(5120, hash, 0, hash, 4000, hash, hash); });
    rejects([&] { gg::validateDeliveryManifest(5120, hash, 500, hash, 4000, hash,
                                                std::string(64, 'b')); });
    std::array<std::uint8_t, 32> shared{};
    for (unsigned i = 0; i < shared.size(); ++i) shared[i] = static_cast<std::uint8_t>(i);
    const auto derived = gg::deriveDeliveryMaterial(shared.data(), shared.size(), device,
                                                     "token-for-native-interop-123");
    const std::string expectedInfo = "gg-edgeone-runtime-v2|" + device +
        "|12c8cf37bdd8499a636f604bd0e0c792419ebc37cf726cd91701ef879f5b7823";
    if (hex(derived.key) != "4ecd5776b602d92360fbdbee89380954b4c61cbb2997ff459486c3f5eec32bf8" ||
        std::string(derived.aad.begin(), derived.aad.end()) != expectedInfo)
        throw std::runtime_error("C++ HKDF/AAD mismatches the Node reference");
    rejects([&] { gg::proofCanonical("activate", 0, device, "material"); });
    rejects([&] { gg::proofCanonical("activate", 1794344400, "bad-device", "material"); });
    rejects([&] { gg::proofCanonical("runtime", 1794344400, device, "material"); });
    rejects([&] { gg::proofCanonical("check", 1794344400, std::string(64, 'G'), "material"); });
    rejects([&] { gg::proofCanonical("unbind", 1794344400, device, ""); });
    rejects([&] { gg::proofCanonical("runtime-v2", 1794344400, device,
                                     std::string(8193, 'A')); });
    if (gg::proofCanonical("runtime-v2", 1794344400, device, "token|key").empty())
        throw std::runtime_error("Valid runtime-v2 action was rejected");
    rejects([&] { gg::deriveDeliveryMaterial(shared.data(), shared.size() - 1,
                                               device, "token"); });
    rejects([&] { gg::deriveDeliveryMaterial(shared.data(), shared.size(),
                                               device, ""); });
    std::array<std::uint8_t, 8192> ciphertext{};
    for (std::size_t i = 0; i < ciphertext.size(); ++i)
        ciphertext[i] = static_cast<std::uint8_t>(i & 255);
    gg::EncryptedTransfer transfer(9000, 10'000);
    if (transfer.append(ciphertext.data(), ciphertext.size()) != 8192 ||
        transfer.append(ciphertext.data(), 808) != 9000) {
        throw std::runtime_error("Native encrypted transfer progress is inconsistent");
    }
    const auto& complete = transfer.finish();
    if (complete.size() != 9000 || complete[0] != ciphertext[0] ||
        complete[8191] != ciphertext[8191] || complete[8192] != ciphertext[0] ||
        complete.back() != ciphertext[807]) {
        throw std::runtime_error("Native encrypted transfer changed ciphertext bytes");
    }
    rejects([&] { transfer.finish(); });
    rejects([&] { transfer.append(ciphertext.data(), 1); });
    gg::EncryptedTransfer truncated(3, 3);
    truncated.append(ciphertext.data(), 2);
    rejects([&] { truncated.finish(); });
    gg::EncryptedTransfer oversized(2, 3);
    rejects([&] { oversized.append(ciphertext.data(), 3); });
    rejects([&] { gg::EncryptedTransfer bad(5'500'017, 5'500'017); });
    rejects([&] { gg::EncryptedTransfer bad(100, 99); });
    rejects([&] { gg::EncryptedTransfer bad(0, 500); });
    auto coordinator = std::make_shared<gg::StartupCoordinator>();
    auto ticket = coordinator->begin();
    gg::EncryptedTransfer authorized(2, 2, coordinator, ticket);
    authorized.append(ciphertext.data(), 1);
    coordinator->invalidate();
    rejects([&] { authorized.append(ciphertext.data(), 1); });
    rejects([&] { authorized.finish(); });
    rejects([&] { gg::EncryptedTransfer obsolete(2, 2, coordinator, ticket); });
    std::cout << "C++ EdgeOne auth policy, HKDF and bounded ciphertext transfer parity OK\n";
}
