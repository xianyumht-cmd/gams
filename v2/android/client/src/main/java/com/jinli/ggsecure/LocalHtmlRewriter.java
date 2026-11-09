package com.jinli.ggsecure;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Replaces both copies of the official engine SRI in the test page, before HTML parsing. */
final class LocalHtmlRewriter {
    private static final Pattern SCRIPT_TAG = Pattern.compile("<script\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern INTEGRITY = Pattern.compile(
            "\\bintegrity\\s*=\\s*['\"](sha384-[A-Za-z0-9+/=]+)['\"]", Pattern.CASE_INSENSITIVE);

    private LocalHtmlRewriter() { }

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
