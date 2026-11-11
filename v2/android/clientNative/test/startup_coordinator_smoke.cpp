#include "../src/main/cpp/startup_coordinator.hpp"

#include <atomic>
#include <cassert>
#include <stdexcept>
#include <thread>
#include <vector>

int main() {
    gg::StartupCoordinator first;
    gg::StartupCoordinator second;
    const auto oldTicket = first.begin();
    assert(first.isCurrent(oldTicket));
    assert(!first.isCurrent(0));
    assert(!first.isCurrent(-1));
    const auto nextTicket = first.begin();
    assert(nextTicket > oldTicket);
    assert(!first.isCurrent(oldTicket));
    assert(first.isCurrent(nextTicket));
    const auto otherTicket = second.begin();
    assert(second.isCurrent(otherTicket));
    first.invalidate();
    assert(!first.isCurrent(nextTicket));
    assert(second.isCurrent(otherTicket));

    std::atomic<int> successfulChecks{0};
    std::vector<std::thread> workers;
    for (int n = 0; n < 4; ++n) {
        workers.emplace_back([&]() {
            for (int i = 0; i < 1000; ++i) {
                auto ticket = first.begin();
                if (first.isCurrent(ticket)) ++successfulChecks;
            }
        });
    }
    for (auto& worker : workers) worker.join();
    assert(successfulChecks > 0);
    const auto lastTicket = second.begin();
    first.close();
    assert(!first.isCurrent(nextTicket));
    assert(!first.isCurrent(oldTicket));
    try {
        first.begin();
        assert(false && "Closed coordinator accepted a new request");
    } catch (const std::logic_error&) { /* Closed means terminal. */ }
    assert(second.isCurrent(lastTicket));
    return 0;
}
