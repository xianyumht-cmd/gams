#pragma once

#include <cstdint>
#include <string_view>
#include <string>
#include <vector>

namespace gg {

enum class ResourceRoute : int {
    pass = 0,
    runtimeEngine = 1,
    emptyOfficialEngine = 2,
    forbiddenCore = 3,
    rewriteHtml = 4,
};

// Android supplies URI-parsed scheme/host and the request headers; native C++
// owns only the deterministic routing decision, not the WebView response.
bool isEdgeOneDirectEngine(bool candidate, std::string_view runtimeVersion);

// The Android lifecycle and Intent handling stay in Java. These native
// functions reproduce their existing pure decisions only.
bool shouldReloadBrowser(bool browserVisible, std::int64_t backgroundAtMs,
                         std::int64_t nowMs, std::int64_t reloadDelayMs);
bool shouldOpenExternalScheme(std::string_view scheme);
bool isTargetSiteHost(std::string_view host);
bool isSuppressedReadyAlert(std::u16string_view message);

ResourceRoute routeWebResource(bool directEngine, std::string_view url,
                               std::string_view virtualGameUrl, bool mainFrame,
                               std::string_view method, std::string_view scheme,
                               std::string_view host, std::string_view accept);

// Output bytes are interpreted by Android as UTF-8 with replacement decoding,
// just as the former Java wrapper did for the original control script.
std::vector<std::uint8_t> wrapControlScript(
    const std::vector<std::uint8_t>& control);

}  // namespace gg
