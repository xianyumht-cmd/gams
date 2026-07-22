package com.jinli.ggsecure;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

final class RuntimeTransport {
    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final String CUSTOM_HOST = RuntimeNames.runtimeCustomHost();
    private static final String WORKER_HOST = RuntimeNames.runtimeWorkerHost();
    private static final String[] NORMAL_HOSTS = { CUSTOM_HOST, WORKER_HOST };
    private static final String[] DNS_RESOLVERS = {
            "223.5.5.5", "119.29.29.29", "1.1.1.1", "8.8.8.8"
    };

    private RuntimeTransport() { }

    static Response postJson(String path, String json, int maximumBytes) throws IOException {
        return requestAcrossChannels(
                "POST", path, json.getBytes(StandardCharsets.UTF_8), "", maximumBytes, true);
    }

    static byte[] getBytes(String path, String authorization, int maximumBytes) throws IOException {
        Response response = requestAcrossChannels(
                "GET", path, null, authorization, maximumBytes, false);
        if (response.status < 200 || response.status >= 300) {
            throw new IOException("运行服务返回 HTTP " + response.status);
        }
        return response.body;
    }

    private static Response requestAcrossChannels(
            String method,
            String path,
            byte[] requestBody,
            String authorization,
            int maximumBytes,
            boolean expectJson
    ) throws IOException {
        List<String> failures = new ArrayList<>();
        for (String host : NORMAL_HOSTS) {
            try {
                Response response = requestHost(
                        host, method, path, requestBody, authorization, maximumBytes);
                if (isExpectedResponse(response, expectJson)) return response;
                failures.add(host + ": HTTP " + response.status + responseReason(response));
            } catch (IOException error) {
                failures.add(host + ": " + shortMessage(error));
            }
        }

        Set<String> addresses = resolveWorkerAddresses(failures);
        int attempted = 0;
        for (String address : addresses) {
            if (++attempted > 12) break;
            try {
                Response response = directTlsRequest(
                        WORKER_HOST, address, method, path, requestBody,
                        authorization, maximumBytes);
                if (isExpectedResponse(response, expectJson)) return response;
                failures.add(address + ": HTTP " + response.status + responseReason(response));
            } catch (IOException error) {
                failures.add(address + ": " + shortMessage(error));
            }
        }

        throw new IOException("运行服务器连接失败：" + joinFailures(failures));
    }

    private static boolean isExpectedResponse(Response response, boolean expectJson) {
        String type = response.contentType.toLowerCase(Locale.ROOT);
        if (expectJson) {
            if (!type.contains("application/json")) return false;
            String text = response.bodyText().trim();
            return text.startsWith("{") && text.endsWith("}");
        }
        if (response.status >= 200 && response.status < 300) {
            return type.contains("application/octet-stream");
        }
        return type.contains("application/json");
    }

    private static Response requestHost(
            String host,
            String method,
            String path,
            byte[] requestBody,
            String authorization,
            int maximumBytes
    ) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(
                "https://" + host + path).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestMethod(method);
        connection.setUseCaches(false);
        connection.setDefaultUseCaches(false);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "application/json, application/octet-stream");
        connection.setRequestProperty("Cache-Control", "no-store, no-cache, max-age=0");
        connection.setRequestProperty("Pragma", "no-cache");
        connection.setRequestProperty("User-Agent", "GG-V2/3 Android");
        if (authorization != null && !authorization.isEmpty()) {
            connection.setRequestProperty("Authorization", authorization);
        }
        if (requestBody != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setFixedLengthStreamingMode(requestBody.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(requestBody);
            }
        }
        try {
            int status = connection.getResponseCode();
            InputStream source = status >= 200 && status < 400
                    ? connection.getInputStream() : connection.getErrorStream();
            byte[] body = source == null ? new byte[0] : readLimited(source, maximumBytes);
            return new Response(
                    status,
                    body,
                    connection.getHeaderField("Content-Type"),
                    connection.getHeaderField("cf-mitigated"));
        } finally {
            connection.disconnect();
        }
    }

    private static Response directTlsRequest(
            String host,
            String address,
            String method,
            String path,
            byte[] requestBody,
            String authorization,
            int maximumBytes
    ) throws IOException {
        Socket plain = new Socket();
        plain.connect(new InetSocketAddress(address, 443), CONNECT_TIMEOUT_MS);
        plain.setSoTimeout(READ_TIMEOUT_MS);

        SSLSocket ssl = null;
        try {
            SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
            ssl = (SSLSocket) factory.createSocket(plain, host, 443, true);
            SSLParameters parameters = ssl.getSSLParameters();
            parameters.setEndpointIdentificationAlgorithm("HTTPS");
            ssl.setSSLParameters(parameters);
            ssl.setSoTimeout(READ_TIMEOUT_MS);
            ssl.startHandshake();

            SSLSession session = ssl.getSession();
            HostnameVerifier verifier = HttpsURLConnection.getDefaultHostnameVerifier();
            if (!verifier.verify(host, session)) {
                throw new IOException("TLS 域名校验失败");
            }

            BufferedOutputStream output = new BufferedOutputStream(ssl.getOutputStream());
            StringBuilder headers = new StringBuilder();
            headers.append(method).append(' ').append(path).append(" HTTP/1.1\r\n");
            headers.append("Host: ").append(host).append("\r\n");
            headers.append("User-Agent: GG-V2/3 Android\r\n");
            headers.append("Accept: application/json, application/octet-stream\r\n");
            headers.append("Cache-Control: no-store, no-cache, max-age=0\r\n");
            headers.append("Pragma: no-cache\r\n");
            if (authorization != null && !authorization.isEmpty()) {
                headers.append("Authorization: ").append(authorization).append("\r\n");
            }
            if (requestBody != null) {
                headers.append("Content-Type: application/json; charset=utf-8\r\n");
                headers.append("Content-Length: ").append(requestBody.length).append("\r\n");
            }
            headers.append("Connection: close\r\n\r\n");
            output.write(headers.toString().getBytes(StandardCharsets.ISO_8859_1));
            if (requestBody != null) output.write(requestBody);
            output.flush();

            return readHttpResponse(ssl.getInputStream(), maximumBytes);
        } finally {
            if (ssl != null) {
                try { ssl.close(); } catch (Exception ignored) { }
            } else {
                try { plain.close(); } catch (Exception ignored) { }
            }
        }
    }

    private static Response readHttpResponse(InputStream raw, int maximumBytes) throws IOException {
        BufferedInputStream input = new BufferedInputStream(raw);
        String statusLine = readAsciiLine(input, 8192);
        if (statusLine == null || !statusLine.startsWith("HTTP/")) {
            throw new IOException("服务器响应格式无效");
        }
        String[] statusParts = statusLine.split(" ", 3);
        if (statusParts.length < 2) throw new IOException("服务器状态行无效");
        int status;
        try {
            status = Integer.parseInt(statusParts[1]);
        } catch (NumberFormatException error) {
            throw new IOException("服务器状态码无效", error);
        }

        String contentType = "";
        String mitigated = "";
        boolean chunked = false;
        long contentLength = -1L;
        for (;;) {
            String line = readAsciiLine(input, 16384);
            if (line == null) throw new EOFException("响应头提前结束");
            if (line.isEmpty()) break;
            int colon = line.indexOf(':');
            if (colon <= 0) continue;
            String name = line.substring(0, colon).trim().toLowerCase(Locale.ROOT);
            String value = line.substring(colon + 1).trim();
            if ("content-type".equals(name)) contentType = value;
            else if ("cf-mitigated".equals(name)) mitigated = value;
            else if ("transfer-encoding".equals(name)
                    && value.toLowerCase(Locale.ROOT).contains("chunked")) {
                chunked = true;
            } else if ("content-length".equals(name)) {
                try { contentLength = Long.parseLong(value); }
                catch (NumberFormatException ignored) { }
            }
        }

        byte[] body;
        if (chunked) body = readChunked(input, maximumBytes);
        else if (contentLength >= 0) body = readFixed(input, contentLength, maximumBytes);
        else body = readLimited(input, maximumBytes);
        return new Response(status, body, contentType, mitigated);
    }

    private static byte[] readChunked(BufferedInputStream input, int maximumBytes)
            throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        for (;;) {
            String sizeLine = readAsciiLine(input, 4096);
            if (sizeLine == null) throw new EOFException("分块响应提前结束");
            int semicolon = sizeLine.indexOf(';');
            String sizeText = (semicolon >= 0
                    ? sizeLine.substring(0, semicolon) : sizeLine).trim();
            int size;
            try { size = Integer.parseInt(sizeText, 16); }
            catch (NumberFormatException error) {
                throw new IOException("分块长度无效", error);
            }
            if (size == 0) {
                while (true) {
                    String trailer = readAsciiLine(input, 8192);
                    if (trailer == null || trailer.isEmpty()) break;
                }
                break;
            }
            if (size < 0 || output.size() + size > maximumBytes) {
                throw new IOException("服务器响应过大");
            }
            copyExact(input, output, size);
            String terminator = readAsciiLine(input, 16);
            if (terminator == null || !terminator.isEmpty()) {
                throw new IOException("分块响应终止符无效");
            }
        }
        return output.toByteArray();
    }

    private static byte[] readFixed(InputStream input, long contentLength, int maximumBytes)
            throws IOException {
        if (contentLength < 0 || contentLength > maximumBytes) {
            throw new IOException("服务器响应过大");
        }
        ByteArrayOutputStream output = new ByteArrayOutputStream((int) contentLength);
        copyExact(input, output, (int) contentLength);
        return output.toByteArray();
    }

    private static void copyExact(
            InputStream input, ByteArrayOutputStream output, int count) throws IOException {
        byte[] buffer = new byte[4096];
        int remaining = count;
        while (remaining > 0) {
            int read = input.read(buffer, 0, Math.min(buffer.length, remaining));
            if (read < 0) throw new EOFException("服务器响应提前结束");
            output.write(buffer, 0, read);
            remaining -= read;
        }
    }

    private static byte[] readLimited(InputStream input, int maximumBytes) throws IOException {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = source.read(buffer)) != -1) {
                total += read;
                if (total > maximumBytes) throw new IOException("运行服务响应过大");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private static String readAsciiLine(InputStream input, int maximumBytes)
            throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        int previous = -1;
        for (;;) {
            int value = input.read();
            if (value < 0) {
                if (output.size() == 0 && previous < 0) return null;
                if (previous >= 0) output.write(previous);
                break;
            }
            if (previous == '\r' && value == '\n') break;
            if (previous >= 0) output.write(previous);
            previous = value;
            if (output.size() > maximumBytes) throw new IOException("响应行过长");
        }
        return output.toString(StandardCharsets.ISO_8859_1.name());
    }

    private static Set<String> resolveWorkerAddresses(List<String> failures) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        for (String resolver : DNS_RESOLVERS) {
            try {
                result.addAll(queryDnsA(WORKER_HOST, resolver));
            } catch (Exception error) {
                failures.add("DNS " + resolver + ": " + shortMessage(error));
            }
        }
        try {
            InetAddress[] system = InetAddress.getAllByName(WORKER_HOST);
            for (InetAddress address : system) {
                if (address.getAddress().length == 4) result.add(address.getHostAddress());
            }
        } catch (Exception error) {
            failures.add("系统 DNS: " + shortMessage(error));
        }
        return result;
    }

    private static List<String> queryDnsA(String host, String resolver) throws IOException {
        SecureRandom random = new SecureRandom();
        int transactionId = random.nextInt(0x10000);
        ByteArrayOutputStream packetBytes = new ByteArrayOutputStream();
        DataOutputStream output = new DataOutputStream(packetBytes);
        output.writeShort(transactionId);
        output.writeShort(0x0100);
        output.writeShort(1);
        output.writeShort(0);
        output.writeShort(0);
        output.writeShort(0);
        for (String label : host.split("\\.")) {
            byte[] bytes = label.getBytes(StandardCharsets.US_ASCII);
            if (bytes.length == 0 || bytes.length > 63) {
                throw new IOException("DNS 名称无效");
            }
            output.writeByte(bytes.length);
            output.write(bytes);
        }
        output.writeByte(0);
        output.writeShort(1);
        output.writeShort(1);
        output.flush();

        byte[] query = packetBytes.toByteArray();
        DatagramSocket socket = new DatagramSocket();
        try {
            socket.setSoTimeout(2500);
            DatagramPacket request = new DatagramPacket(
                    query, query.length, InetAddress.getByName(resolver), 53);
            socket.send(request);
            byte[] responseBuffer = new byte[2048];
            DatagramPacket responsePacket = new DatagramPacket(
                    responseBuffer, responseBuffer.length);
            socket.receive(responsePacket);
            return parseDnsA(responseBuffer, responsePacket.getLength(), transactionId);
        } catch (SocketTimeoutException error) {
            throw new IOException("DNS 查询超时", error);
        } finally {
            socket.close();
        }
    }

    private static List<String> parseDnsA(
            byte[] bytes, int length, int transactionId) throws IOException {
        if (length < 12) throw new IOException("DNS 响应过短");
        DataInputStream input = new DataInputStream(
                new ByteArrayInputStream(bytes, 0, length));
        int id = input.readUnsignedShort();
        int flags = input.readUnsignedShort();
        int questionCount = input.readUnsignedShort();
        int answerCount = input.readUnsignedShort();
        input.readUnsignedShort();
        input.readUnsignedShort();
        if (id != transactionId || (flags & 0x8000) == 0 || (flags & 0x000F) != 0) {
            throw new IOException("DNS 响应无效");
        }
        int offset = 12;
        for (int i = 0; i < questionCount; i++) {
            offset = skipDnsName(bytes, length, offset);
            offset += 4;
            if (offset > length) throw new IOException("DNS 问题段越界");
        }
        List<String> addresses = new ArrayList<>();
        for (int i = 0; i < answerCount; i++) {
            offset = skipDnsName(bytes, length, offset);
            if (offset + 10 > length) throw new IOException("DNS 答案段越界");
            int type = unsignedShort(bytes, offset);
            int clazz = unsignedShort(bytes, offset + 2);
            int dataLength = unsignedShort(bytes, offset + 8);
            offset += 10;
            if (offset + dataLength > length) throw new IOException("DNS 数据越界");
            if (type == 1 && clazz == 1 && dataLength == 4) {
                addresses.add((bytes[offset] & 0xFF) + "."
                        + (bytes[offset + 1] & 0xFF) + "."
                        + (bytes[offset + 2] & 0xFF) + "."
                        + (bytes[offset + 3] & 0xFF));
            }
            offset += dataLength;
        }
        if (addresses.isEmpty()) throw new IOException("DNS 未返回 IPv4 地址");
        return addresses;
    }

    private static int skipDnsName(byte[] bytes, int length, int offset)
            throws IOException {
        int steps = 0;
        while (offset < length) {
            int value = bytes[offset] & 0xFF;
            if ((value & 0xC0) == 0xC0) {
                if (offset + 1 >= length) throw new IOException("DNS 压缩指针越界");
                return offset + 2;
            }
            offset += 1;
            if (value == 0) return offset;
            if (value > 63 || offset + value > length) {
                throw new IOException("DNS 名称越界");
            }
            offset += value;
            if (++steps > 128) throw new IOException("DNS 名称异常");
        }
        throw new IOException("DNS 名称未终止");
    }

    private static int unsignedShort(byte[] bytes, int offset) {
        return ((bytes[offset] & 0xFF) << 8) | (bytes[offset + 1] & 0xFF);
    }

    private static String responseReason(Response response) {
        if ("challenge".equalsIgnoreCase(response.mitigated)) return "（Cloudflare挑战）";
        if (!response.contentType.isEmpty()) return "（" + response.contentType + "）";
        return "（响应类型无效）";
    }

    private static String shortMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return error.getClass().getSimpleName();
        }
        return message.length() > 100 ? message.substring(0, 100) : message;
    }

    private static String joinFailures(List<String> failures) {
        if (failures.isEmpty()) return "没有可用连接通道";
        StringBuilder out = new StringBuilder();
        int start = Math.max(0, failures.size() - 8);
        for (int i = start; i < failures.size(); i++) {
            if (out.length() > 0) out.append("；");
            out.append(failures.get(i));
        }
        return out.toString();
    }

    static final class Response {
        final int status;
        final byte[] body;
        final String contentType;
        final String mitigated;

        Response(int status, byte[] body, String contentType, String mitigated) {
            this.status = status;
            this.body = body == null ? new byte[0] : body;
            this.contentType = contentType == null ? "" : contentType;
            this.mitigated = mitigated == null ? "" : mitigated;
        }

        String bodyText() {
            return new String(body, StandardCharsets.UTF_8);
        }
    }
}
