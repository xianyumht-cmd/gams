#include "runtime_bundle.hpp"

#include <algorithm>
#include <array>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <utility>

#include <zlib.h>

namespace gg {
namespace {

void require(bool valid, const char* message) {
    if (!valid) throw std::runtime_error(message);
}

std::uint16_t u16(const std::uint8_t* p) {
    return static_cast<std::uint16_t>(p[0]) |
           static_cast<std::uint16_t>(p[1] << 8);
}

std::uint32_t u32(const std::uint8_t* p) {
    return static_cast<std::uint32_t>(p[0]) |
           (static_cast<std::uint32_t>(p[1]) << 8) |
           (static_cast<std::uint32_t>(p[2]) << 16) |
           (static_cast<std::uint32_t>(p[3]) << 24);
}

std::uint32_t rotr(std::uint32_t v, unsigned n) {
    return (v >> n) | (v << (32 - n));
}

constexpr std::uint32_t kShaConstants[] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};

class Sha256 {
public:
    void update(const std::uint8_t* bytes, std::size_t size) {
        for (std::size_t i = 0; i < size; ++i) {
            block_[used_++] = bytes[i];
            if (used_ == 64) {
                transform();
                used_ = 0;
            }
        }
        total_ += size;
    }

    std::array<std::uint8_t, 32> finish() {
        const std::uint64_t bits = static_cast<std::uint64_t>(total_) * 8;
        block_[used_++] = 0x80;
        if (used_ > 56) {
            while (used_ < 64) block_[used_++] = 0;
            transform();
            used_ = 0;
        }
        while (used_ < 56) block_[used_++] = 0;
        for (int i = 7; i >= 0; --i) block_[used_++] = static_cast<std::uint8_t>(bits >> (i * 8));
        transform();
        std::array<std::uint8_t, 32> out{};
        for (int i = 0; i < 8; ++i) {
            for (int j = 0; j < 4; ++j) out[i * 4 + j] = static_cast<std::uint8_t>(h_[i] >> (24 - 8 * j));
        }
        return out;
    }

private:
    void transform() {
        std::uint32_t w[64]{};
        for (int i = 0; i < 16; ++i) {
            const int p = i * 4;
            w[i] = (static_cast<std::uint32_t>(block_[p]) << 24) |
                   (static_cast<std::uint32_t>(block_[p + 1]) << 16) |
                   (static_cast<std::uint32_t>(block_[p + 2]) << 8) | block_[p + 3];
        }
        for (int i = 16; i < 64; ++i) {
            const auto s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            const auto s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        auto a = h_[0], b = h_[1], c = h_[2], d = h_[3];
        auto e = h_[4], f = h_[5], g = h_[6], h = h_[7];
        for (int i = 0; i < 64; ++i) {
            const auto s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const auto choose = (e & f) ^ (~e & g);
            const auto t1 = h + s1 + choose + kShaConstants[i] + w[i];
            const auto s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const auto majority = (a & b) ^ (a & c) ^ (b & c);
            const auto t2 = s0 + majority;
            h = g; g = f; f = e; e = d + t1;
            d = c; c = b; b = a; a = t1 + t2;
        }
        h_[0] += a; h_[1] += b; h_[2] += c; h_[3] += d;
        h_[4] += e; h_[5] += f; h_[6] += g; h_[7] += h;
        std::fill(std::begin(w), std::end(w), 0);
    }

    std::array<std::uint8_t, 64> block_{};
    std::uint32_t h_[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                           0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
    std::size_t used_ = 0;
    std::size_t total_ = 0;
};

struct ZipEntry {
    std::string name;
    std::uint16_t flags = 0;
    std::uint16_t compression = 0;
    std::uint32_t crc = 0;
    std::size_t compressed = 0;
    std::size_t expanded = 0;
    std::size_t localOffset = 0;
};

std::vector<std::uint8_t> inflateEntry(const std::uint8_t* zip, std::size_t size,
                                        std::size_t centralStart, const ZipEntry& entry) {
    constexpr std::size_t kLocalHeader = 30;
    require(entry.localOffset <= centralStart &&
            centralStart - entry.localOffset >= kLocalHeader, "Invalid local ZIP header");
    const auto* header = zip + entry.localOffset;
    require(u32(header) == 0x04034b50, "Invalid local ZIP signature");
    require(u16(header + 6) == entry.flags && u16(header + 8) == entry.compression,
            "ZIP headers disagree");
    const std::size_t nameLength = u16(header + 26);
    const std::size_t extraLength = u16(header + 28);
    const std::size_t nameStart = entry.localOffset + kLocalHeader;
    require(nameStart <= centralStart && nameLength <= centralStart - nameStart,
            "ZIP local name exceeds archive");
    require(nameLength == entry.name.size() &&
            std::memcmp(zip + nameStart, entry.name.data(), nameLength) == 0,
            "ZIP entry name mismatch");
    const std::size_t payloadStart = nameStart + nameLength;
    require(extraLength <= centralStart - payloadStart, "ZIP local extra exceeds archive");
    const std::size_t payloadOffset = payloadStart + extraLength;
    require(entry.compressed <= centralStart - payloadOffset, "ZIP entry exceeds archive");
    require(entry.expanded > 0, "Empty runtime entry");
    (void)size;
    std::vector<std::uint8_t> out(entry.expanded);
    const auto* in = zip + payloadOffset;
    if (entry.compression == 0) {
        require(entry.compressed == entry.expanded, "Invalid stored ZIP entry size");
        std::memcpy(out.data(), in, out.size());
    } else if (entry.compression == 8) {
        z_stream stream{};
        require(inflateInit2(&stream, -MAX_WBITS) == Z_OK, "ZIP inflater init failed");
        stream.next_in = const_cast<Bytef*>(reinterpret_cast<const Bytef*>(in));
        stream.avail_in = static_cast<uInt>(entry.compressed);
        stream.next_out = reinterpret_cast<Bytef*>(out.data());
        stream.avail_out = static_cast<uInt>(out.size());
        const int status = inflate(&stream, Z_FINISH);
        const bool valid = status == Z_STREAM_END && stream.total_in == entry.compressed &&
                           stream.total_out == entry.expanded;
        inflateEnd(&stream);
        require(valid, "ZIP decompression or length mismatch");
    } else {
        throw std::runtime_error("Unsupported ZIP compression");
    }
    require(crc32(0, reinterpret_cast<const Bytef*>(out.data()),
                  static_cast<uInt>(out.size())) == entry.crc, "ZIP CRC mismatch");
    return out;
}

void verify(const std::vector<std::uint8_t>& bytes, const EntrySpec& expected) {
    require(bytes.size() == expected.size, "Runtime size mismatch");
    const std::string calculated = sha256Hex(bytes.data(), bytes.size());
    require(expected.sha256.size() == 64, "Invalid runtime SHA-256 manifest");
    unsigned diff = 0;
    for (std::size_t i = 0; i < 64; ++i) {
        const char lower = static_cast<char>(expected.sha256[i] >= 'A' && expected.sha256[i] <= 'F'
            ? expected.sha256[i] + ('a' - 'A') : expected.sha256[i]);
        diff |= static_cast<unsigned char>(lower ^ calculated[i]);
    }
    require(diff == 0, "Runtime SHA-256 mismatch");
}

}  // namespace

void secureClear(std::vector<std::uint8_t>& data) noexcept {
    volatile std::uint8_t* p = data.data();
    for (std::size_t i = 0; i < data.size(); ++i) p[i] = 0;
    data.clear();
}

RuntimeBundle::~RuntimeBundle() {
    secureClear(noname);
    secureClear(game);
}

std::string sha256Hex(const std::uint8_t* bytes, std::size_t length) {
    const auto digest = sha256Digest(bytes, length);
    constexpr char kHex[] = "0123456789abcdef";
    std::string result(64, '\0');
    for (std::size_t i = 0; i < digest.size(); ++i) {
        result[i * 2] = kHex[digest[i] >> 4];
        result[i * 2 + 1] = kHex[digest[i] & 15];
    }
    return result;
}

std::array<std::uint8_t, 32> sha256Digest(const std::uint8_t* bytes, std::size_t length) {
    Sha256 hash;
    hash.update(bytes, length);
    return hash.finish();
}

std::unique_ptr<RuntimeBundle> parseRuntimeZip(const std::uint8_t* bytes,
    std::size_t length, const EntrySpec& nonameSpec, const EntrySpec& gameSpec,
    const std::string& expectedBundleSha256) {
    require(bytes != nullptr && length >= 22 && length <= 5'500'000,
            "Runtime ZIP length outside limits");
    require(nonameSpec.size > 0 && nonameSpec.size <= 2 * 1024 * 1024 &&
            gameSpec.size > 0 && gameSpec.size <= 16 * 1024 * 1024,
            "Runtime entry size outside limits");
    if (!expectedBundleSha256.empty()) {
        require(expectedBundleSha256.size() == 64 &&
                expectedBundleSha256.find_first_not_of("0123456789abcdef") == std::string::npos,
                "Invalid bundle SHA-256 manifest");
        const auto actual = sha256Hex(bytes, length);
        unsigned difference = 0;
        for (std::size_t i = 0; i < actual.size(); ++i)
            difference |= static_cast<unsigned char>(actual[i] ^ expectedBundleSha256[i]);
        require(difference == 0, "Runtime ZIP SHA-256 mismatch");
    }
    std::size_t eocd = length;
    const std::size_t first = length > 65557 ? length - 65557 : 0;
    for (std::size_t pos = length - 22;; --pos) {
        if (u32(bytes + pos) == 0x06054b50 && u16(bytes + pos + 20) == length - pos - 22) {
            eocd = pos;
            break;
        }
        if (pos == first) break;
    }
    require(eocd != length, "ZIP central directory missing");
    const auto* footer = bytes + eocd;
    require(u16(footer + 4) == 0 && u16(footer + 6) == 0 &&
            u16(footer + 8) == 2 && u16(footer + 10) == 2,
            "Runtime ZIP must contain exactly two entries on one disk");
    const std::size_t centralLength = u32(footer + 12);
    const std::size_t centralStart = u32(footer + 16);
    require(centralStart <= eocd && centralLength == eocd - centralStart,
            "Invalid ZIP central directory boundaries");
    std::array<ZipEntry, 2> entries;
    std::size_t cursor = centralStart;
    for (auto& entry : entries) {
        require(cursor <= eocd && eocd - cursor >= 46, "Truncated ZIP central header");
        const auto* p = bytes + cursor;
        require(u32(p) == 0x02014b50, "Invalid ZIP central signature");
        entry.flags = u16(p + 8);
        entry.compression = u16(p + 10);
        require((entry.flags & 0x0001) == 0 && (entry.flags & ~0x0808) == 0,
                "Unsupported encrypted or flagged ZIP entry");
        entry.crc = u32(p + 16);
        entry.compressed = u32(p + 20);
        entry.expanded = u32(p + 24);
        const std::size_t nameLen = u16(p + 28);
        const std::size_t extraLen = u16(p + 30);
        const std::size_t commentLen = u16(p + 32);
        require(u16(p + 34) == 0 && u32(p + 42) != 0xffffffff &&
                entry.expanded != 0xffffffff && entry.compressed != 0xffffffff,
                "ZIP64 or multi-disk entry not supported");
        require(nameLen <= eocd - cursor - 46 && extraLen <= eocd - cursor - 46 - nameLen &&
                commentLen <= eocd - cursor - 46 - nameLen - extraLen,
                "Truncated ZIP central name or metadata");
        entry.name.assign(reinterpret_cast<const char*>(p + 46), nameLen);
        require(entry.name == "noname.js" || entry.name == "game.js",
                "Unexpected ZIP filename");
        entry.localOffset = u32(p + 42);
        cursor += 46 + nameLen + extraLen + commentLen;
    }
    require(cursor == eocd && entries[0].name != entries[1].name,
            "Duplicate runtime entry or extra ZIP metadata");

    auto result = std::make_unique<RuntimeBundle>();
    for (const auto& entry : entries) {
        if (entry.name == "noname.js") {
            require(entry.expanded == nonameSpec.size, "Noname length mismatch");
            result->noname = inflateEntry(bytes, length, centralStart, entry);
            verify(result->noname, nonameSpec);
        } else {
            require(entry.expanded == gameSpec.size, "Game length mismatch");
            result->game = inflateEntry(bytes, length, centralStart, entry);
            verify(result->game, gameSpec);
        }
    }
    return result;
}

}  // namespace gg
