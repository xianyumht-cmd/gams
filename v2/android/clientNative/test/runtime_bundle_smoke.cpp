#include "../src/main/cpp/runtime_bundle.hpp"

#include <algorithm>
#include <cstdint>
#include <fstream>
#include <functional>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>

std::vector<std::uint8_t> readFile(const char* name) {
    std::ifstream file(name, std::ios::binary);
    if (!file) throw std::runtime_error("Missing smoke fixture");
    return {std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>()};
}

void reject(const std::function<void()>& action) {
    try {
        action();
    } catch (const std::runtime_error&) {
        return;
    }
    throw std::runtime_error("Native reader accepted a malformed or mismatched ZIP");
}

int main(int argc, char** argv) {
    if (argc != 4) throw std::runtime_error("Usage: smoke bundle.zip noname.js game.js");
    const auto archive = readFile(argv[1]);
    const auto noname = readFile(argv[2]);
    const auto game = readFile(argv[3]);
    gg::EntrySpec first{noname.size(), gg::sha256Hex(noname.data(), noname.size())};
    gg::EntrySpec second{game.size(), gg::sha256Hex(game.data(), game.size())};
    if (gg::sha256Hex(reinterpret_cast<const std::uint8_t*>("abc"), 3) !=
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") {
        throw std::runtime_error("SHA-256 known-answer test failed");
    }
    auto payload = gg::parseRuntimeZip(archive.data(), archive.size(), first, second);
    if (payload->noname != noname || payload->game != game)
        throw std::runtime_error("Native ZIP does not match Java-side entry bytes");
    reject([&] { gg::parseRuntimeZip(archive.data(), archive.size() - 1, first, second); });
    reject([&] { gg::parseRuntimeZip(archive.data(), archive.size(),
                                    {first.size + 1, first.sha256}, second); });
    reject([&] { gg::parseRuntimeZip(archive.data(), archive.size(),
                                    {first.size, std::string(64, '0')}, second); });
    auto modified = archive;
    modified[30 + std::string("noname.js").size() + 20] ^= 0x40;
    reject([&] { gg::parseRuntimeZip(modified.data(), modified.size(), first, second); });
    gg::secureClear(payload->game);
    if (!payload->game.empty()) throw std::runtime_error("Native wipe failed");
    std::cout << "C++ runtime parity, SHA-256, CRC, corruption and limits OK\n";
}
