package com.jinli.ggsecure;

import java.nio.charset.StandardCharsets;

public final class LocalHtmlRewriterSmoke {
    private static final String OLD = "sha384-Iua9BwFL1Zld4LrRaEBQLPycAlpSnlmVSLjU/9LOsJGtmRGaUMZ+yasuImkq2vCP";
    private static final String NEW = "sha384-CDD31tTvMcJAZcvYeIX7R0xofGOa/XWElGrm0PEIAJtsaWDbG5qY1ClL4R1HIpFM";

    public static void main(String[] args) throws Exception {
        String original;
        if (args.length > 0 && "--stdin".equals(args[0])) {
            original = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        } else {
            original = "<script src='//c2.cgyouxi.com/website/hfplayer/v3/bin/official/game.js?v=123' "
                    + "integrity=\"" + OLD + "\" crossorigin=\"anonymous\"></script>"
                    + "<script>if (el.integrity !== \"" + OLD + "\") location.replace('about:blank');</script>";
        }
        String patched = LocalHtmlRewriter.rewrite(original, NEW);
        if (patched == null || patched.contains(OLD) || count(patched, NEW) < 2) {
            throw new AssertionError("Historical official SRI and inline guard were not both patched");
        }
        if (LocalHtmlRewriter.rewrite("<html>no engine</html>", NEW) != null) {
            throw new AssertionError("Unexpected page structure should fail closed");
        }
        String directHtml = "<html><HEAD data-test='yes'><script src='/bin/official/game.js' "
                + "integrity='" + OLD + "'></script><script>"
                + "window.location.replace('about:blank');"
                + "window.location.replace(\"about:blank\");"
                + "location.href='about:blank';"
                + "window.location.assign('about:blank');"
                + "</script></HEAD><body></body></html>";
        String userscript = "window.__GG_TEST__='$42';/* backslash \\\\ */";
        LocalHtmlRewriter.RewriteResult stats =
                LocalHtmlRewriter.rewriteGuardFreeWithStats(directHtml, userscript);
        String direct = stats.html;
        if (stats.blankCalls != 3 || stats.blankHref != 1
                || stats.integrityAttributes != 1 || stats.headTags != 1) {
            throw new AssertionError("Diagnostic rewrite counts do not match the real replacements");
        }
        if (direct == null || !direct.contains("<HEAD data-test='yes'><script>" + userscript + "</script>")) {
            throw new AssertionError("New userscript must be the first child of <head>");
        }
        if (direct.contains("integrity='" + OLD + "'") || !direct.contains("integrity=\"\"")) {
            throw new AssertionError("The engine SRI attribute was not cleared");
        }
        if (count(direct, "void 0") != 4 || direct.contains("about:blank")) {
            throw new AssertionError("HTML guard navigation was not fully disabled");
        }
        LocalHtmlRewriter.RewriteResult missingHead =
                LocalHtmlRewriter.rewriteGuardFreeWithStats("<html><body></body></html>", userscript);
        if (missingHead.html != null || missingHead.headTags != 0) {
            throw new AssertionError("Headless document cannot be safely injected");
        }
        System.out.println("HTML SRI legacy and 1.4.1 guard-free inline injection tests passed");
    }

    private static int count(String text, String needle) {
        int result = 0;
        for (int i = 0; (i = text.indexOf(needle, i)) >= 0; i += needle.length()) result++;
        return result;
    }
}
