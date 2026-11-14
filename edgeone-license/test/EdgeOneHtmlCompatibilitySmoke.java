package com.jinli.ggsecure;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPOutputStream;

public final class EdgeOneHtmlCompatibilitySmoke {
    public static void main(String[] ignored) throws Exception {
        String original = "<html><HEAD><script integrity='sha384-ABC=='>"
                + "location.replace('about:blank');</script></HEAD></html>";
        String output = EdgeOneHtmlCompatibility.rewrite(original, "window.gg=1;");
        if (!output.contains("<script>window.gg=1;</script>") || output.contains("sha384-") ||
                output.contains("replace('about:blank')")) throw new AssertionError("rewrite failed");
        if (!EdgeOneHtmlCompatibility.rewrite("<head></head>", "const x='</script>'; ")
                .contains("<\\/script")) throw new AssertionError("script end not escaped");
        byte[] raw = original.getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(compressed)) { gzip.write(raw); }
        byte[] actual = EdgeOneHtmlCompatibility.readHtml(new ByteArrayInputStream(compressed.toByteArray()), 4096);
        if (!java.util.Arrays.equals(raw, actual)) throw new AssertionError("gzip decode failed");
        try {
            EdgeOneHtmlCompatibility.readHtml(new ByteArrayInputStream(compressed.toByteArray()), 10);
            throw new AssertionError("gzip limit not enforced");
        } catch (java.io.IOException expected) { }
        System.out.println("EdgeOne 1.4.1 HTML compatibility smoke passed");
    }
}
