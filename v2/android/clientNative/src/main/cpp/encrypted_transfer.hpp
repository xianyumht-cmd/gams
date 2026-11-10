#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

namespace gg {

// An encrypted, exact-length EdgeOne transfer. The Java HTTPS adapter feeds
// bounded chunks; the Android AES-GCM provider still consumes the final bytes.
class EncryptedTransfer {
public:
    EncryptedTransfer(int expectedBytes, int maximumBytes);
    ~EncryptedTransfer();

    EncryptedTransfer(const EncryptedTransfer&) = delete;
    EncryptedTransfer& operator=(const EncryptedTransfer&) = delete;

    int append(const std::uint8_t* data, std::size_t count);
    const std::vector<std::uint8_t>& finish();

private:
    std::vector<std::uint8_t> received_;
    std::size_t expected_;
    bool finished_ = false;
};

}  // namespace gg
