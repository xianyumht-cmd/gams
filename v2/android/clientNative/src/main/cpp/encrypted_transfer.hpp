#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <vector>

namespace gg {

class StartupCoordinator;

// An encrypted, exact-length EdgeOne transfer. The Java HTTPS adapter feeds
// bounded chunks; the Android AES-GCM provider still consumes the final bytes.
class EncryptedTransfer {
public:
    EncryptedTransfer(int expectedBytes, int maximumBytes,
                      std::shared_ptr<StartupCoordinator> startup = {},
                      std::int64_t ticket = 0);
    ~EncryptedTransfer();

    EncryptedTransfer(const EncryptedTransfer&) = delete;
    EncryptedTransfer& operator=(const EncryptedTransfer&) = delete;

    int append(const std::uint8_t* data, std::size_t count);
    const std::vector<std::uint8_t>& finish();

private:
    void requireCurrent() const;
    std::vector<std::uint8_t> received_;
    std::size_t expected_;
    bool finished_ = false;
    std::shared_ptr<StartupCoordinator> startup_;
    std::int64_t ticket_;
};

}  // namespace gg
