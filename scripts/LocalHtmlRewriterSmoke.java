package com.jinli.ggsecure;

import java.nio.charset.StandardCharsets;

public final class LocalHtmlRewriterSmoke {
    private static final String OLD = "sha384-Iua9BwFL1Zld4LrRaEBQLPycAlpSnlmVSLjU/9LOsJGtmRGaUMZ+yasuImkq2vCP";
    private static final String NEW = "sha384-CDD31tTvMcJAZcvYeIX7R0xofGOa/XWElGrm0PEIAJtsaWDbG5qY1ClL4R1HIpFM";
    private static final String DIRECT = "sha384-KoqnKYX/Agwvncta87t5MVOkU1dM791aaGlf5kvWRzJbmJsLejeRz59MGAEE6JlJ";

    public static void main(String[] args) throws Exception {
        String original;
        if (args.length > 0 && "--stdin".equals(args[0])) {
            original = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        } else {
            original = "<script src='//c2.cgyouxi.com/website/hfplayer/v3/bin/official/game.js?v=123' "
                    + "integrity=\"" + OLD + "\" crossorigin=\"anonymous\"></script>"
                    + "<script>if (el.integrity !== \"" + OLD + "\") location.replace('about:blank');</script>";
        }
        for (String expected : new String[]{NEW, DIRECT}) {
            String patched = LocalHtmlRewriter.rewrite(original, expected);
            if (patched == null || patched.contains(OLD) || count(patched, expected) < 2) {
                throw new AssertionError("Official script SRI and inline check were not both patched: " + expected);
            }
        }
        if (LocalHtmlRewriter.rewrite("<html>no engine</html>", NEW) != null) {
            throw new AssertionError("Unexpected page structure should fail closed");
        }
        System.out.println("HTML SRI and inline-check rewriting passed");
    }

    private static int count(String text, String needle) {
        int result = 0;
        for (int i = 0; (i = text.indexOf(needle, i)) >= 0; i += needle.length()) result++;
        return result;
    }
}
