#include "encrypted_transfer.hpp"
#include "runtime_bundle.hpp"

#include <stdexcept>

namespace gg {

EncryptedTransfer::EncryptedTransfer(int expectedBytes, int maximumBytes) {
    // Keep this bound aligned with EdgeOneCandidateClient.MAX_ZIP + GCM tag.
    if (maximumBytes < 1 || maximumBytes > 5'500'016 ||
        expectedBytes < 1 || expectedBytes > maximumBytes) {
        throw std::runtime_error("Invalid encrypted runtime length");
    }
    expected_ = static_cast<std::size_t>(expectedBytes);
    received_.reserve(expected_);
}

EncryptedTransfer::~EncryptedTransfer() {
    secureClear(received_);
}

int EncryptedTransfer::append(const std::uint8_t* data, std::size_t count) {
    if (finished_ || !data || count == 0 || count > 8192 ||
        count > expected_ - received_.size()) {
        throw std::runtime_error("Encrypted runtime exceeded declared length");
    }
    received_.insert(received_.end(), data, data + count);
    return static_cast<int>(received_.size());
}

const std::vector<std::uint8_t>& EncryptedTransfer::finish() {
    if (finished_ || received_.size() != expected_) {
        throw std::runtime_error("Encrypted runtime download incomplete");
    }
    finished_ = true;
    return received_;
}

}  // namespace gg
