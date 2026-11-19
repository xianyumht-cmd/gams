#pragma once

#include <cstdint>
#include <mutex>

namespace gg {

// One coordinator per Android license-manager instance. Tickets are never
// reused, so work from a previous login cannot publish into the next one.
class StartupCoordinator {
public:
    std::int64_t begin();
    bool isCurrent(std::int64_t ticket) const;
    void invalidate();
    void close();

private:
    mutable std::mutex mutex_;
    std::int64_t generation_ = 0;
    bool closed_ = false;
};

}  // namespace gg
