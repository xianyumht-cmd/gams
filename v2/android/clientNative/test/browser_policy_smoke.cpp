#include "../src/main/cpp/browser_policy.hpp"

#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
constexpr const char* kVirtual = "https://gg.invalid/assets/game.js";

void check(gg::ResourceRoute want, bool direct, std::string url,
           bool mainFrame = false, std::string method = "GET",
           std::string scheme = "https", std::string host = "",
           std::string accept = "") {
    const auto actual = gg::routeWebResource(direct, url, kVirtual,
                                            mainFrame, method, scheme, host, accept);
    if (actual != want) throw std::runtime_error("WebView route parity mismatch: " + url);
}
}  // namespace

int main() {
    using gg::ResourceRoute;
    if (!gg::shouldReloadBrowser(true, 1000, 301000, 300000) ||
        gg::shouldReloadBrowser(true, 1000, 300999, 300000) ||
        gg::shouldReloadBrowser(false, 1000, 301000, 300000) ||
        gg::shouldReloadBrowser(true, 0, 301000, 300000) ||
        gg::shouldReloadBrowser(true, 2000, 1000, 300000) ||
        !gg::shouldReloadBrowser(true, std::numeric_limits<std::int64_t>::max(),
            std::numeric_limits<std::int64_t>::min(), 1)) {
        throw std::runtime_error("Android resume/reinitialize lifecycle policy drift");
    }
    if (gg::shouldOpenExternalScheme("HTTP") ||
        gg::shouldOpenExternalScheme("https") ||
        !gg::shouldOpenExternalScheme("intent") ||
        !gg::shouldOpenExternalScheme("")) {
        throw std::runtime_error("Android external-scheme navigation policy drift");
    }
    if (!gg::isTargetSiteHost("M.66RPG.COM") ||
        !gg::isTargetSiteHost("www.66rpg.com") ||
        gg::isTargetSiteHost("fake-m.66rpg.com") ||
        gg::isTargetSiteHost("")) {
        throw std::runtime_error("WebView document-start target host policy drift");
    }
    if (!gg::isSuppressedReadyAlert(u"脚本加载完成~") ||
        !gg::isSuppressedReadyAlert(u" \t脚本加载完成～\r\n") ||
        gg::isSuppressedReadyAlert(u"\u3000脚本加载完成~") ||
        gg::isSuppressedReadyAlert(u"脚本加载完成～～") ||
        gg::isSuppressedReadyAlert(u"脚本加载完成")) {
        throw std::runtime_error("Suppressed WebView JS alert policy drift");
    }
    if (!gg::isEdgeOneDirectEngine(true, "1.4.1-1.0.41") ||
        !gg::isEdgeOneDirectEngine(true, "1.4.6-1.0.43") ||
        gg::isEdgeOneDirectEngine(true, "1.4.6") ||
        gg::isEdgeOneDirectEngine(true, "1.4.60-1.0.43") ||
        gg::isEdgeOneDirectEngine(true, "1.1.4-1.0.5") ||
        gg::isEdgeOneDirectEngine(false, "1.4.6-1.0.43") ||
        gg::isEdgeOneDirectEngine(false, "1.4.1-1.0.41")) {
        throw std::runtime_error("Native direct-engine version policy drift");
    }
    const std::string official =
        "https://C2.CGYouXi.com/website/hfplayer/abc/bin/official/game.JS";
    check(ResourceRoute::runtimeEngine, true, official);
    check(ResourceRoute::emptyOfficialEngine, false, official);
    check(ResourceRoute::runtimeEngine, false, kVirtual);
    check(ResourceRoute::runtimeEngine, false,
          "https://gams-script-edge.2320006072.workers.dev/engine/stable.js?x=1");
    check(ResourceRoute::runtimeEngine, false, "https://space-z.ai/game.js");
    check(ResourceRoute::forbiddenCore, false,
          "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/remote-script/x.js");
    check(ResourceRoute::forbiddenCore, false,
          "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/game-engine/y.js");
    check(ResourceRoute::pass, false,
          "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/readme.md");
    check(ResourceRoute::pass, false, "https://m.66rpg.com/");
    check(ResourceRoute::pass, true, kVirtual);
    check(ResourceRoute::pass, true,
          "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/game-engine/y.js");
    check(ResourceRoute::rewriteHtml, true, "https://m.66rpg.com/game",
          true, "gEt", "HTTPS", "M.66RPG.COM", "text/*, TEXT/HTML;q=0.8");
    check(ResourceRoute::rewriteHtml, true, "https://www.66rpg.com/",
          true, "GET", "https", "www.66rpg.com", "text/html");
    check(ResourceRoute::pass, true, "https://m.66rpg.com/",
          false, "GET", "https", "m.66rpg.com", "text/html");
    check(ResourceRoute::pass, true, "https://m.66rpg.com/",
          true, "POST", "https", "m.66rpg.com", "text/html");
    check(ResourceRoute::pass, true, "http://m.66rpg.com/",
          true, "GET", "http", "m.66rpg.com", "text/html");
    check(ResourceRoute::pass, true, "https://fake-66rpg.com/",
          true, "GET", "https", "fake-66rpg.com", "text/html");
    check(ResourceRoute::pass, true, "https://m.66rpg.com/",
          true, "GET", "https", "m.66rpg.com", "text/javascript");

    const std::string control = "let x='测试';\nvoid 0;";
    const std::vector<std::uint8_t> controlBytes(control.begin(), control.end());
    const auto actual = gg::wrapControlScript(controlBytes);
    const std::string expected =
        "(function(){"
        "if(window.__GG_V2_CONTROL_LOADED__)return;"
        "window.__GG_V2_CONTROL_LOADED__=true;"
        "try{\n" + control + "\n}catch(e){"
        "window.__GG_V2_CONTROL_LOADED__=false;"
        "console.error('[GG]',e);}"
        "})();";
    if (std::string(actual.begin(), actual.end()) != expected) {
        throw std::runtime_error("C++ WebView wrapper changed Java reference bytes");
    }
    bool rejected = false;
    try { gg::wrapControlScript({}); }
    catch (const std::runtime_error&) { rejected = true; }
    if (!rejected) throw std::runtime_error("Empty control script accepted");
    std::cout << "C++ WebView route and wrapper parity OK\n";
}
