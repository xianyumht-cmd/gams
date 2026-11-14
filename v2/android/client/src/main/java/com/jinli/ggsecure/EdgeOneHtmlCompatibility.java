package com.jinli.ggsecure;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

/** Isolated compatibility mode for 1.4.1 remote JS, matching the prior local test approach. */
final class EdgeOneHtmlCompatibility {
    private static final Pattern HEAD = Pattern.compile("<head\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern SCRIPT_END = Pattern.compile("</script", Pattern.CASE_INSENSITIVE);
    private static final Pattern SRI = Pattern.compile("\\bintegrity\\s*=\\s*(['\"])sha384-[A-Za-z0-9+/=]*\\1", Pattern.CASE_INSENSITIVE);
    private static final Pattern BLANK_CALL = Pattern.compile(
            "(?:window\\s*\\.\\s*)?location\\s*\\.\\s*(?:replace|assign)\\s*\\(\\s*(['\"])about:blank\\1\\s*\\)", Pattern.CASE_INSENSITIVE);
    private static final Pattern BLANK_HREF = Pattern.compile(
            "(?:window\\s*\\.\\s*)?location\\s*\\.\\s*href\\s*=\\s*(['\"])about:blank\\1", Pattern.CASE_INSENSITIVE);

    private EdgeOneHtmlCompatibility() { }

    static String rewrite(String html, String script) {
        if (script == null || script.isEmpty()) throw new IllegalArgumentException("Script missing");
        String out = BLANK_CALL.matcher(html).replaceAll("void 0");
        out = BLANK_HREF.matcher(out).replaceAll("void 0");
        out = SRI.matcher(out).replaceAll("integrity=\"\"");
        Matcher head = HEAD.matcher(out);
        if (!head.find()) throw new IllegalArgumentException("HTML head missing");
        String inline = SCRIPT_END.matcher(script).replaceAll(Matcher.quoteReplacement("<\\/script"));
        return out.substring(0, head.end()) + "<script>" + inline + "</script>" + out.substring(head.end());
    }

    static byte[] readHtml(InputStream raw, int maxDecodedBytes) throws IOException {
        BufferedInputStream buffered = new BufferedInputStream(raw);
        buffered.mark(2);
        int a = buffered.read(), b = buffered.read();
        buffered.reset();
        InputStream decoded = a == 0x1f && b == 0x8b ? new GZIPInputStream(buffered) : buffered;
        try (InputStream source = decoded; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] data = new byte[8192];
            int n;
            while ((n = source.read(data)) != -1) {
                if (n > maxDecodedBytes - output.size()) throw new IOException("HTML too large");
                output.write(data, 0, n);
            }
            return output.toByteArray();
        }
    }
}
