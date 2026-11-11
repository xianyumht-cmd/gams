#include "startup_coordinator.hpp"

#include <limits>
#include <stdexcept>

namespace gg {

std::int64_t StartupCoordinator::begin() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (closed_) throw std::logic_error("Startup coordinator is closed");
    if (generation_ == std::numeric_limits<std::int64_t>::max()) {
        closed_ = true;
        throw std::overflow_error("Startup ticket counter exhausted");
    }
    return ++generation_;
}

bool StartupCoordinator::isCurrent(std::int64_t ticket) const {
    std::lock_guard<std::mutex> lock(mutex_);
    return !closed_ && ticket > 0 && ticket == generation_;
}

void StartupCoordinator::invalidate() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (closed_) return;
    if (generation_ == std::numeric_limits<std::int64_t>::max()) {
        closed_ = true;
    } else {
        ++generation_;
    }
}

void StartupCoordinator::close() {
    std::lock_guard<std::mutex> lock(mutex_);
    closed_ = true;
}

}  // namespace gg
