#include "../src/main/cpp/html_compatibility.hpp"

#include <cstdint>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

std::string rewrite(const std::string& html, const std::string& script) {
    const std::vector<std::uint8_t> control(script.begin(), script.end());
    auto bytes = gg::rewriteEdgeOneHtml(
        reinterpret_cast<const std::uint8_t*>(html.data()), html.size(), control);
    return {bytes.begin(), bytes.end()};
}

int main() {
    const std::string page = "<html><HEAD data-x='1'><script integrity='sha384-ABC=='>"
        "location.replace('about:blank');window.location.href=\"about:blank\";"
        "location.assign('about:blank');</script></HEAD></html>";
    const std::string expected = "<html><HEAD data-x='1'><script>"
        "const x='foo<\\/script';</script><script integrity=\"\">"
        "void 0;void 0;void 0;</script></HEAD></html>";
    if (rewrite(page, "const x='foo</ScRiPt';") != expected) {
        throw std::runtime_error("C++ HTML compatibility output mismatch");
    }
    if (rewrite("<head></head><head>second</head>", "// ok") !=
            "<head><script>// ok</script></head><head>second</head>") {
        throw std::runtime_error("C++ HTML script was not injected after first head");
    }
    if (rewrite("<head>window.location.replace('not-blank')</head>", "// ok") !=
            "<head><script>// ok</script>window.location.replace('not-blank')</head>") {
        throw std::runtime_error("C++ HTML rewrite changed unrelated navigation");
    }
    bool missingHeadRejected = false;
    try { rewrite("<body>missing head</body>", "const x=1;"); }
    catch (const std::runtime_error&) { missingHeadRejected = true; }
    if (!missingHeadRejected) throw std::runtime_error("C++ accepted HTML without head");
    std::cout << "C++ EdgeOne 1.4.1 HTML rewrite smoke OK\n";
}
