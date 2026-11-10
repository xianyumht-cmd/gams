#include "../src/main/cpp/edgeone_protocol.hpp"

#include <array>
#include <cstdint>
#include <functional>
#include <iostream>
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
    rejects([&] { gg::deriveDeliveryMaterial(shared.data(), shared.size() - 1,
                                               device, "token"); });
    rejects([&] { gg::deriveDeliveryMaterial(shared.data(), shared.size(),
                                               device, ""); });
    std::cout << "C++ EdgeOne saved auth, JSON, canonical and HKDF parity OK\n";
}
