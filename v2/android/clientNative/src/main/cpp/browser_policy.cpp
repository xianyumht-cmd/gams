#include "browser_policy.hpp"

#include <stdexcept>
#include <string>

namespace gg {
namespace {

std::string asciiLower(std::string_view source) {
    std::string result;
    result.reserve(source.size());
    for (unsigned char ch : source) {
        if (ch >= 'A' && ch <= 'Z') ch = static_cast<unsigned char>(ch - 'A' + 'a');
        result.push_back(static_cast<char>(ch));
    }
    return result;
}

bool contains(std::string_view source, std::string_view value) {
    return source.find(value) != std::string_view::npos;
}

void append(std::vector<std::uint8_t>& out, std::string_view data) {
    out.insert(out.end(), data.begin(), data.end());
}

}  // namespace

bool isEdgeOneDirectEngine(bool candidate, std::string_view runtimeVersion) {
    // The cloud manifest supplies the noname/game pair as "noname-game".
    // The 1.4.6 control script needs the same official-engine substitution
    // and HTML compatibility route as the known 1.4.1 direct-engine build.
    // Opt in per verified compatibility family rather than treating every
    // unknown JS release as direct-engine compatible.
    if (!candidate) return false;
    return runtimeVersion.substr(0, 6) == "1.4.1-" ||
           runtimeVersion.substr(0, 6) == "1.4.6-";
}

bool shouldReloadBrowser(bool browserVisible, std::int64_t backgroundAtMs,
                         std::int64_t nowMs, std::int64_t reloadDelayMs) {
    if (!browserVisible || backgroundAtMs <= 0) return false;
    // Java long subtraction wraps modulo 2^64; compute its signed comparison
    // without triggering undefined C++ signed overflow at extreme values.
    constexpr std::uint64_t signBit = std::uint64_t{1} << 63;
    const auto elapsed = static_cast<std::uint64_t>(nowMs) -
                         static_cast<std::uint64_t>(backgroundAtMs);
    const auto delay = static_cast<std::uint64_t>(reloadDelayMs);
    if ((elapsed ^ delay) & signBit) return (elapsed & signBit) == 0;
    return elapsed >= delay;
}

bool shouldOpenExternalScheme(std::string_view scheme) {
    const std::string normalized = asciiLower(scheme);
    return normalized != "http" && normalized != "https";
}

bool isTargetSiteHost(std::string_view host) {
    const std::string normalized = asciiLower(host);
    return normalized == "m.66rpg.com" || normalized == "www.66rpg.com";
}

bool isSuppressedReadyAlert(std::u16string_view message) {
    // Matches Java String.trim(): only UTF-16 code units <= U+0020 disappear.
    std::size_t first = 0;
    std::size_t last = message.size();
    while (first < last && message[first] <= u' ') ++first;
    while (last > first && message[last - 1] <= u' ') --last;
    constexpr std::u16string_view expected = u"脚本加载完成~";
    if (last - first != expected.size()) return false;
    for (std::size_t i = 0; i < expected.size(); ++i) {
        const char16_t normalized = message[first + i] == u'～'
            ? u'~' : message[first + i];
        if (normalized != expected[i]) return false;
    }
    return true;
}

ResourceRoute routeWebResource(bool directEngine, std::string_view url,
                               std::string_view virtualGameUrl, bool mainFrame,
                               std::string_view method, std::string_view scheme,
                               std::string_view host, std::string_view accept) {
    const std::string lowerUrl = asciiLower(url);
    const bool official = contains(lowerUrl, "c2.cgyouxi.com/website/hfplayer/") &&
                          contains(lowerUrl, "/bin/official/game.js");
    if (directEngine) {
        if (official) return ResourceRoute::runtimeEngine;
        if (mainFrame && asciiLower(method) == "get" && asciiLower(scheme) == "https") {
            const std::string lowerHost = asciiLower(host);
            if (isTargetSiteHost(lowerHost) &&
                contains(asciiLower(accept), "text/html")) {
                return ResourceRoute::rewriteHtml;
            }
        }
        return ResourceRoute::pass;
    }

    if (official) return ResourceRoute::emptyOfficialEngine;
    if (lowerUrl == asciiLower(virtualGameUrl) ||
        contains(lowerUrl, "gams-script-edge.2320006072.workers.dev/engine/stable.js") ||
        contains(lowerUrl, "space-z.ai/game.js")) {
        return ResourceRoute::runtimeEngine;
    }
    if (contains(lowerUrl, "raw.githubusercontent.com/xianyumht-cmd/gams") &&
        (contains(lowerUrl, "/remote-script/") || contains(lowerUrl, "/game-engine/"))) {
        return ResourceRoute::forbiddenCore;
    }
    return ResourceRoute::pass;
}

std::vector<std::uint8_t> wrapControlScript(
        const std::vector<std::uint8_t>& control) {
    if (control.empty() || control.size() > 2 * 1024 * 1024) {
        throw std::runtime_error("Invalid control script for WebView");
    }
    constexpr std::string_view before =
        "(function(){"
        "if(window.__GG_V2_CONTROL_LOADED__)return;"
        "window.__GG_V2_CONTROL_LOADED__=true;"
        "try{\n";
    constexpr std::string_view after =
        "\n}catch(e){"
        "window.__GG_V2_CONTROL_LOADED__=false;"
        "console.error('[GG]',e);}"
        "})();";
    std::vector<std::uint8_t> result;
    result.reserve(before.size() + control.size() + after.size());
    append(result, before);
    result.insert(result.end(), control.begin(), control.end());
    append(result, after);
    return result;
}

}  // namespace gg
