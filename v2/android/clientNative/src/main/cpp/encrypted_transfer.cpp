#include "encrypted_transfer.hpp"
#include "runtime_bundle.hpp"
#include "startup_coordinator.hpp"

#include <stdexcept>
#include <utility>

namespace gg {

EncryptedTransfer::EncryptedTransfer(int expectedBytes, int maximumBytes,
        std::shared_ptr<StartupCoordinator> startup, std::int64_t ticket)
        : startup_(std::move(startup)), ticket_(ticket) {
    // Keep this bound aligned with EdgeOneCandidateClient.MAX_ZIP + GCM tag.
    if (maximumBytes < 1 || maximumBytes > 5'500'016 ||
        expectedBytes < 1 || expectedBytes > maximumBytes) {
        throw std::runtime_error("Invalid encrypted runtime length");
    }
    expected_ = static_cast<std::size_t>(expectedBytes);
    received_.reserve(expected_);
    requireCurrent();
}

EncryptedTransfer::~EncryptedTransfer() {
    secureClear(received_);
}

int EncryptedTransfer::append(const std::uint8_t* data, std::size_t count) {
    requireCurrent();
    if (finished_ || !data || count == 0 || count > 8192 ||
        count > expected_ - received_.size()) {
        throw std::runtime_error("Encrypted runtime exceeded declared length");
    }
    received_.insert(received_.end(), data, data + count);
    return static_cast<int>(received_.size());
}

const std::vector<std::uint8_t>& EncryptedTransfer::finish() {
    requireCurrent();
    if (finished_ || received_.size() != expected_) {
        throw std::runtime_error("Encrypted runtime download incomplete");
    }
    finished_ = true;
    return received_;
}

void EncryptedTransfer::requireCurrent() const {
    if (startup_ && !startup_->isCurrent(ticket_)) {
        throw std::runtime_error("Encrypted runtime transfer was canceled");
    }
}

}  // namespace gg
