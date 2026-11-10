#pragma once

#include <cstddef>
#include <cstdint>
#include <array>
#include <memory>
#include <string>
#include <vector>

namespace gg {

struct EntrySpec {
    std::size_t size;
    std::string sha256;
};

struct RuntimeBundle {
    std::vector<std::uint8_t> noname;
    std::vector<std::uint8_t> game;

    ~RuntimeBundle();
    RuntimeBundle(const RuntimeBundle&) = delete;
    RuntimeBundle& operator=(const RuntimeBundle&) = delete;
    RuntimeBundle() = default;
};

// Strict reader for the two-entry ZIP emitted by pack_runtime.py.
// Throws std::runtime_error on untrusted input; retains neither the ZIP nor a path to it.
std::unique_ptr<RuntimeBundle> parseRuntimeZip(
    const std::uint8_t* bytes, std::size_t length,
    const EntrySpec& noname, const EntrySpec& game);

std::string sha256Hex(const std::uint8_t* bytes, std::size_t length);
std::array<std::uint8_t, 32> sha256Digest(const std::uint8_t* bytes, std::size_t length);
void secureClear(std::vector<std::uint8_t>& data) noexcept;

}  // namespace gg
