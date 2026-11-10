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
    return candidate && runtimeVersion.substr(0, 5) == "1.4.1";
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
            if ((lowerHost == "m.66rpg.com" || lowerHost == "www.66rpg.com") &&
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
