package com.jinli.ggsecure;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import javax.net.ssl.HttpsURLConnection;

final class RuntimeTransport {
    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final String[] HOSTS = {
            RuntimeNames.runtimeCustomHost(),
            RuntimeNames.runtimeWorkerHost()
    };

    private RuntimeTransport() { }

    static Response postJson(String path, String json, int maximumBytes) throws IOException {
        return requestAcrossHosts(
                "POST", path, json.getBytes(StandardCharsets.UTF_8), "", maximumBytes, true);
    }

    static byte[] getBytes(String path, String authorization, int maximumBytes) throws IOException {
        Response response = requestAcrossHosts(
                "GET", path, null, authorization, maximumBytes, false);
        if (response.status < 200 || response.status >= 300) {
            throw new IOException("运行服务返回 HTTP " + response.status);
        }
        return response.body;
    }

    private static Response requestAcrossHosts(
            String method,
            String path,
            byte[] requestBody,
            String authorization,
            int maximumBytes,
            boolean expectJson
    ) throws IOException {
        List<String> failures = new ArrayList<>();
        for (String host : HOSTS) {
            try {
                Response response = requestHost(
                        host, method, path, requestBody, authorization, maximumBytes);
                if (isExpectedResponse(response, expectJson)) return response;
                failures.add(host + ": HTTP " + response.status + " 类型 " + response.contentType);
            } catch (IOException error) {
                failures.add(host + ": " + shortMessage(error));
            }
        }
        throw new IOException("运行服务器连接失败：" + String.join("；", failures));
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
        connection.setRequestProperty("User-Agent", "GG-V2/2 Android");
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
            return new Response(status, body, connection.getHeaderField("Content-Type"));
        } finally {
            connection.disconnect();
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

    private static String shortMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) return error.getClass().getSimpleName();
        return message.length() > 100 ? message.substring(0, 100) : message;
    }

    static final class Response {
        final int status;
        final byte[] body;
        final String contentType;

        Response(int status, byte[] body, String contentType) {
            this.status = status;
            this.body = body;
            this.contentType = contentType == null ? "" : contentType;
        }

        String bodyText() {
            return new String(body, StandardCharsets.UTF_8);
        }
    }
}
