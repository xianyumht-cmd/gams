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
    std::cout << "C++ EdgeOne request canonical and HKDF match Node reference\n";
}
