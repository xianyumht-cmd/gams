package com.jinli.ggsecure;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Small HTML compatibility transforms used only by the isolated Android test flavor. */
final class LocalHtmlRewriter {
    private static final Pattern HEAD_TAG = Pattern.compile("<head\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern SCRIPT_END = Pattern.compile("</script", Pattern.CASE_INSENSITIVE);
    private static final Pattern SHA384_ATTRIBUTE = Pattern.compile(
            "\\bintegrity\\s*=\\s*(['\"])sha384-[A-Za-z0-9+/=]*\\1", Pattern.CASE_INSENSITIVE);
    private static final Pattern BLANK_REPLACE = Pattern.compile(
            "(?:window\\s*\\.\\s*)?location\\s*\\.\\s*(?:replace|assign)\\s*\\(\\s*(['\"])about:blank\\1\\s*\\)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern BLANK_HREF = Pattern.compile(
            "(?:window\\s*\\.\\s*)?location\\s*\\.\\s*href\\s*=\\s*(['\"])about:blank\\1",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SCRIPT_TAG = Pattern.compile("<script\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern INTEGRITY = Pattern.compile(
            "\\bintegrity\\s*=\\s*['\"](sha384-[A-Za-z0-9+/=]+)['\"]", Pattern.CASE_INSENSITIVE);

    private LocalHtmlRewriter() { }

    static final class RewriteResult {
        final String html;
        final int blankCalls;
        final int blankHref;
        final int integrityAttributes;
        final int headTags;

        RewriteResult(String html, int blankCalls, int blankHref,
                int integrityAttributes, int headTags) {
            this.html = html;
            this.blankCalls = blankCalls;
            this.blankHref = blankHref;
            this.integrityAttributes = integrityAttributes;
            this.headTags = headTags;
        }
    }

    /** For the 1.4.1 local test: do not require or rewrite any SRI digest. */
    static String rewriteGuardFree(String html, String userscript) {
        return rewriteGuardFreeWithStats(html, userscript).html;
    }

    static RewriteResult rewriteGuardFreeWithStats(String html, String userscript) {
        if (html == null || userscript == null || userscript.isEmpty()) {
            throw new IllegalArgumentException("HTML 或用户脚本不正确");
        }
        int calls = countMatches(BLANK_REPLACE, html);
        String rewritten = BLANK_REPLACE.matcher(html).replaceAll("void 0");
        int href = countMatches(BLANK_HREF, rewritten);
        rewritten = BLANK_HREF.matcher(rewritten).replaceAll("void 0");
        int integrity = countMatches(SHA384_ATTRIBUTE, rewritten);
        rewritten = SHA384_ATTRIBUTE.matcher(rewritten).replaceAll("integrity=\"\"");
        int heads = countMatches(HEAD_TAG, rewritten);
        Matcher head = HEAD_TAG.matcher(rewritten);
        if (!head.find()) return new RewriteResult(null, calls, href, integrity, heads);

        // Prevent a literal closing script tag inside the asset from ending this injection.
        String inline = SCRIPT_END.matcher(userscript)
                .replaceAll(Matcher.quoteReplacement("<\\/script"));
        return new RewriteResult(rewritten.substring(0, head.end()) + "<script>" + inline
                + "</script>" + rewritten.substring(head.end()), calls, href, integrity, heads);
    }

    private static int countMatches(Pattern pattern, String text) {
        Matcher matches = pattern.matcher(text);
        int count = 0;
        while (matches.find()) count++;
        return count;
    }

    static String rewrite(String html, String replacementSri) {
        if (html == null || replacementSri == null || !replacementSri.startsWith("sha384-")) {
            throw new IllegalArgumentException("HTML 或 SRI 不正确");
        }
        Matcher scripts = SCRIPT_TAG.matcher(html);
        String originalSri = null;
        while (scripts.find()) {
            String tag = scripts.group();
            if (!tag.toLowerCase(Locale.ROOT).contains("/bin/official/game.js")) continue;
            Matcher integrity = INTEGRITY.matcher(tag);
            if (!integrity.find()) return null;
            originalSri = integrity.group(1);
            break;
        }
        if (originalSri == null) return null;
        // The page compares the same literal in an inline script. Patch both.
        if (count(html, originalSri) < 2) return null;
        return html.replace(originalSri, replacementSri);
    }

    private static int count(String text, String needle) {
        int total = 0;
        for (int offset = 0; (offset = text.indexOf(needle, offset)) >= 0; offset += needle.length()) {
            total++;
        }
        return total;
    }
}
