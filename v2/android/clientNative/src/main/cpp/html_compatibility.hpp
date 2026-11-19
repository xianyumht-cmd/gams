#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

namespace gg {

// Reproduces EdgeOneHtmlCompatibility.rewrite() for UTF-8 HTML and verified
// control JS. Networking, gzip and WebView response construction stay in Java.
std::vector<std::uint8_t> rewriteEdgeOneHtml(const std::uint8_t* html,
                                              std::size_t htmlLength,
                                              const std::vector<std::uint8_t>& control);

}  // namespace gg
