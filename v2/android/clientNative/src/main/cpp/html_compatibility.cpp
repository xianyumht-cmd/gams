#include "html_compatibility.hpp"

#include <regex>
#include <stdexcept>
#include <string>

namespace gg {
namespace {

const std::regex kBlankCall(
    R"((?:window\s*\.\s*)?location\s*\.\s*(?:replace|assign)\s*\(\s*(['"])about:blank\1\s*\))",
    std::regex::ECMAScript | std::regex::icase);
const std::regex kBlankHref(
    R"((?:window\s*\.\s*)?location\s*\.\s*href\s*=\s*(['"])about:blank\1)",
    std::regex::ECMAScript | std::regex::icase);
const std::regex kSri(
    R"(\bintegrity\s*=\s*(['"])sha384-[A-Za-z0-9+/=]*\1)",
    std::regex::ECMAScript | std::regex::icase);
const std::regex kHead(R"(<head\b[^>]*>)",
                       std::regex::ECMAScript | std::regex::icase);

bool scriptEndAt(const std::vector<std::uint8_t>& bytes, std::size_t index) {
    constexpr char pattern[] = "</script";
    if (bytes.size() - index < sizeof(pattern) - 1) return false;
    for (std::size_t i = 0; i < sizeof(pattern) - 1; ++i) {
        unsigned char ch = bytes[index + i];
        if (ch >= 'A' && ch <= 'Z') ch = static_cast<unsigned char>(ch - 'A' + 'a');
        if (ch != pattern[i]) return false;
    }
    return true;
}

struct TemporaryControl {
    std::vector<std::uint8_t> bytes;
    ~TemporaryControl() {
        volatile std::uint8_t* p = bytes.data();
        for (std::size_t i = 0; i < bytes.size(); ++i) p[i] = 0;
    }
};

}  // namespace

std::vector<std::uint8_t> rewriteEdgeOneHtml(const std::uint8_t* html,
                                              std::size_t htmlLength,
                                              const std::vector<std::uint8_t>& control) {
    // A Java UTF-8 decode can replace malformed source bytes with U+FFFD,
    // which expands to three bytes when encoded again for the native bridge.
    if (!html || htmlLength > 6 * 1024 * 1024 ||
        control.empty() || control.size() > 2 * 1024 * 1024) {
        throw std::runtime_error("Invalid HTML or control script");
    }
    // Preserve the Java replacement order and replacement literals exactly.
    std::string out(reinterpret_cast<const char*>(html), htmlLength);
    out = std::regex_replace(out, kBlankCall, "void 0");
    out = std::regex_replace(out, kBlankHref, "void 0");
    out = std::regex_replace(out, kSri, "integrity=\"\"");
    std::smatch head;
    if (!std::regex_search(out, head, kHead)) {
        throw std::runtime_error("HTML head missing");
    }

    // `</script` in the control layer must never terminate the injected tag.
    // The Java Matcher replacement emits a fixed lowercase `<\/script`.
    TemporaryControl escaped;
    escaped.bytes.reserve(control.size() + control.size() / 8 + 16);
    constexpr char kEscaped[] = "<\\/script";
    for (std::size_t i = 0; i < control.size();) {
        if (scriptEndAt(control, i)) {
            escaped.bytes.insert(escaped.bytes.end(), kEscaped,
                                 kEscaped + sizeof(kEscaped) - 1);
            i += 8;
        } else {
            escaped.bytes.push_back(control[i++]);
        }
    }

    constexpr char kOpen[] = "<script>";
    constexpr char kClose[] = "</script>";
    const auto split = static_cast<std::size_t>(head.position() + head.length());
    std::vector<std::uint8_t> result;
    result.reserve(out.size() + escaped.bytes.size() + sizeof(kOpen) + sizeof(kClose));
    result.insert(result.end(), out.begin(), out.begin() + static_cast<std::ptrdiff_t>(split));
    result.insert(result.end(), kOpen, kOpen + sizeof(kOpen) - 1);
    result.insert(result.end(), escaped.bytes.begin(), escaped.bytes.end());
    result.insert(result.end(), kClose, kClose + sizeof(kClose) - 1);
    result.insert(result.end(), out.begin() + static_cast<std::ptrdiff_t>(split), out.end());
    return result;
}

}  // namespace gg
