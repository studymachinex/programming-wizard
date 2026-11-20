import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPOutputStream;

/**
 * Build Your Own HTTP Server — implementação de referência dos 14 stages
 * do desafio do CodeCrafters.
 *
 * Uso:
 *   java -jar http-server.jar
 *   java -jar http-server.jar --directory /tmp/data
 *   java -jar http-server.jar --port 4221 --directory /tmp/data
 */
public class Main {
  private static final int DEFAULT_PORT = 4221;
  private static final int SOCKET_TIMEOUT_MS = 30_000;
  private static final int MAX_START_LINE = 8 * 1024;
  private static final int MAX_HEADER_LINE = 8 * 1024;
  private static final int MAX_HEADERS = 100;

  private static Path baseDirectory = Paths.get(".").toAbsolutePath().normalize();

  public static void main(String[] args) throws IOException {
    int port = DEFAULT_PORT;
    for (int i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--directory" -> {
          if (i + 1 >= args.length) {
            throw new IllegalArgumentException("--directory exige um caminho");
          }
          baseDirectory = Paths.get(args[++i]).toAbsolutePath().normalize();
        }
        case "--port" -> {
          if (i + 1 >= args.length) {
            throw new IllegalArgumentException("--port exige um número");
          }
          port = Integer.parseInt(args[++i]);
        }
        default -> System.err.println("Argumento ignorado: " + args[i]);
      }
    }

    System.out.println("Logs from your program will appear here!");
    System.out.println("HTTP server listening on port " + port + " (directory: " + baseDirectory + ")");

    try (ServerSocket serverSocket = new ServerSocket()) {
      // O tester reinicia o programa com frequência; SO_REUSEADDR evita
      // "Address already in use" entre execuções.
      serverSocket.setReuseAddress(true);
      serverSocket.bind(new InetSocketAddress("0.0.0.0", port));

      try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
        while (true) {
          Socket client = serverSocket.accept();
          executor.submit(() -> handleConnection(client));
        }
      }
    }
  }

  private static void handleConnection(Socket socket) {
    try (socket) {
      socket.setSoTimeout(SOCKET_TIMEOUT_MS);
      InputStream in = new BufferedInputStream(socket.getInputStream());
      OutputStream out = new BufferedOutputStream(socket.getOutputStream());

      while (true) {
        Request request;
        try {
          request = readRequest(in);
        } catch (SocketTimeoutException timeout) {
          break;
        } catch (BadRequestException badRequest) {
          writeResponse(out, Request.empty(), Response.text(400, badRequest.getMessage()), true);
          break;
        }

        if (request == null) {
          break;
        }

        boolean close = request.shouldClose();
        Response response;
        try {
          response = route(request);
        } catch (Exception error) {
          System.err.println("Erro ao processar " + request.startLine + ": " + error.getMessage());
          response = Response.text(500, "Internal Server Error");
        }

        writeResponse(out, request, response, close);
        if (close) {
          break;
        }
      }
    } catch (IOException error) {
      // Clientes fecham conexões no meio do stream o tempo todo; só logamos
      // erros que não sejam desconexões normais.
      if (!(error.getMessage() != null && error.getMessage().contains("Connection reset"))) {
        System.err.println("IOException: " + error.getMessage());
      }
    }
  }

  private static Request readRequest(InputStream in) throws IOException {
    String startLine;
    do {
      startLine = readLine(in, MAX_START_LINE);
      if (startLine == null) {
        return null;
      }
    } while (startLine.isEmpty());

    String[] parts = startLine.split(" ");
    if (parts.length != 3) {
      throw new BadRequestException("Malformed request line");
    }

    String method = parts[0].toUpperCase(Locale.ROOT);
    String target = parts[1];
    String version = parts[2];

    if (target.startsWith("http://") || target.startsWith("https://")) {
      try {
        target = URI.create(target).getRawPath();
      } catch (IllegalArgumentException ignored) {
        // Mantém o target original; o roteamento devolverá 404.
      }
    }
    int queryIndex = target.indexOf('?');
    if (queryIndex >= 0) {
      target = target.substring(0, queryIndex);
    }

    Map<String, String> headers = new LinkedHashMap<>();
    for (int count = 0; ; count++) {
      if (count > MAX_HEADERS) {
        throw new BadRequestException("Too many headers");
      }
      String line = readLine(in, MAX_HEADER_LINE);
      if (line == null) {
        throw new BadRequestException("Unexpected end of headers");
      }
      if (line.isEmpty()) {
        break;
      }
      int colon = line.indexOf(':');
      if (colon <= 0) {
        continue;
      }
      String name = line.substring(0, colon).trim().toLowerCase(Locale.ROOT);
      String value = line.substring(colon + 1).trim();
      headers.merge(name, value, (oldValue, newValue) -> oldValue + ", " + newValue);
    }

    byte[] body;
    String transferEncoding = headers.get("transfer-encoding");
    if (transferEncoding != null && transferEncoding.toLowerCase(Locale.ROOT).contains("chunked")) {
      body = readChunkedBody(in);
    } else {
      long length = parseContentLength(headers.get("content-length"));
      if (length > 10 * 1024 * 1024) {
        throw new BadRequestException("Request body too large");
      }
      body = readExactly(in, (int) length);
    }

    return new Request(method, target, version, headers, body, startLine);
  }

  private static byte[] readChunkedBody(InputStream in) throws IOException {
    ByteArrayOutputStream body = new ByteArrayOutputStream();
    while (true) {
      String sizeLine = readLine(in, MAX_HEADER_LINE);
      if (sizeLine == null) {
        throw new BadRequestException("Unexpected end of chunked body");
      }
      int extension = sizeLine.indexOf(';');
      if (extension >= 0) {
        sizeLine = sizeLine.substring(0, extension);
      }
      int size;
      try {
        size = Integer.parseInt(sizeLine.trim(), 16);
      } catch (NumberFormatException error) {
        throw new BadRequestException("Invalid chunk size");
      }
      if (size == 0) {
        // Consome trailers até a linha em branco.
        String trailer;
        do {
          trailer = readLine(in, MAX_HEADER_LINE);
        } while (trailer != null && !trailer.isEmpty());
        break;
      }
      body.write(readExactly(in, size));
      String crlf = readLine(in, 2);
      if (crlf == null || !crlf.isEmpty()) {
        throw new BadRequestException("Invalid chunk terminator");
      }
    }
    return body.toByteArray();
  }

  private static long parseContentLength(String value) throws BadRequestException {
    if (value == null || value.isBlank()) {
      return 0;
    }
    try {
      return Long.parseLong(value.trim());
    } catch (NumberFormatException error) {
      throw new BadRequestException("Invalid Content-Length");
    }
  }

  private static byte[] readExactly(InputStream in, int length) throws IOException {
    byte[] data = new byte[length];
    int offset = 0;
    while (offset < length) {
      int read = in.read(data, offset, length - offset);
      if (read == -1) {
        throw new BadRequestException("Unexpected end of body");
      }
      offset += read;
    }
    return data;
  }

  private static String readLine(InputStream in, int maxLength) throws IOException {
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    int value;
    while ((value = in.read()) != -1) {
      if (value == '\n') {
        byte[] bytes = buffer.toByteArray();
        int length = bytes.length;
        if (length > 0 && bytes[length - 1] == '\r') {
          length--;
        }
        return new String(bytes, 0, length, StandardCharsets.ISO_8859_1);
      }
      buffer.write(value);
      if (buffer.size() > maxLength) {
        throw new BadRequestException("Line too long");
      }
    }
    if (buffer.size() == 0) {
      return null;
    }
    return buffer.toString(StandardCharsets.ISO_8859_1);
  }

  private static Response route(Request request) throws IOException {
    if (!request.version.equals("HTTP/1.1") && !request.version.equals("HTTP/1.0")) {
      return Response.text(505, "HTTP Version Not Supported");
    }

    String path = request.target;

    if (request.method.equals("GET") || request.method.equals("HEAD")) {
      if (path.equals("/")) {
        return Response.text(200, "");
      }
      if (path.equals("/user-agent")) {
        return Response.text(200, request.headers.getOrDefault("user-agent", ""));
      }
      if (path.startsWith("/echo/")) {
        return Response.text(200, percentDecode(path.substring("/echo/".length())));
      }
      if (path.startsWith("/files/")) {
        Path file = resolveInsideBase(path.substring("/files/".length()));
        if (file == null || !Files.isRegularFile(file)) {
          return Response.text(404, "Not Found");
        }
        Response response = Response.bytes(200, Files.readAllBytes(file));
        response.headers.put("Content-Type", "application/octet-stream");
        return response;
      }
      return Response.text(404, "Not Found");
    }

    if (request.method.equals("POST")) {
      if (path.startsWith("/files/")) {
        Path file = resolveInsideBase(path.substring("/files/".length()));
        if (file == null) {
          return Response.text(403, "Forbidden");
        }
        Path parent = file.getParent();
        if (parent != null) {
          Files.createDirectories(parent);
        }
        Files.write(file, request.body);
        return Response.text(201, "Created");
      }
      return Response.text(404, "Not Found");
    }

    Response methodNotAllowed = Response.text(405, "Method Not Allowed");
    methodNotAllowed.headers.put("Allow", "GET, HEAD, POST");
    return methodNotAllowed;
  }

  private static Path resolveInsideBase(String rawName) {
    if (rawName.isBlank()) {
      return null;
    }
    String decoded = percentDecode(rawName);
    Path candidate = baseDirectory.resolve(decoded).normalize();
    if (!candidate.startsWith(baseDirectory)) {
      return null;
    }
    return candidate;
  }

  private static String percentDecode(String value) {
    if (value.indexOf('%') < 0) {
      return value;
    }
    ByteArrayOutputStream out = new ByteArrayOutputStream(value.length());
    for (int i = 0; i < value.length(); i++) {
      char current = value.charAt(i);
      if (current == '%' && i + 2 < value.length()) {
        try {
          out.write(Integer.parseInt(value.substring(i + 1, i + 3), 16));
          i += 2;
          continue;
        } catch (NumberFormatException ignored) {
          // Não é uma sequência válida; mantém o caractere literal.
        }
      }
      out.write((byte) current);
    }
    return out.toString(StandardCharsets.UTF_8);
  }

  private static void writeResponse(
      OutputStream out, Request request, Response response, boolean close) throws IOException {
    if (!response.headers.containsKey("Content-Type")) {
      response.headers.put("Content-Type", "text/plain");
    }

    byte[] body = response.body;
    boolean isHead = request.method != null && request.method.equals("HEAD");
    boolean canCompress =
        body.length > 0
            && response.status == 200
            && !response.headers.containsKey("Content-Encoding")
            && acceptsGzip(request.headers.get("accept-encoding"));

    if (canCompress) {
      body = gzip(body);
      response.headers.put("Content-Encoding", "gzip");
    }

    response.headers.put("Content-Length", String.valueOf(body.length));
    response.headers.put("Connection", close ? "close" : "keep-alive");

    StringBuilder head = new StringBuilder();
    head.append("HTTP/1.1 ")
        .append(response.status)
        .append(' ')
        .append(response.reason)
        .append("\r\n");
    for (Map.Entry<String, String> header : response.headers.entrySet()) {
      head.append(header.getKey()).append(": ").append(header.getValue()).append("\r\n");
    }
    head.append("\r\n");

    out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
    if (!isHead) {
      out.write(body);
    }
    out.flush();
  }

  private static boolean acceptsGzip(String acceptEncoding) {
    if (acceptEncoding == null || acceptEncoding.isBlank()) {
      return false;
    }
    double gzipQuality = -1;
    double wildcardQuality = -1;
    for (String entry : acceptEncoding.split(",")) {
      String[] parts = entry.trim().split(";");
      String coding = parts[0].trim().toLowerCase(Locale.ROOT);
      double quality = 1.0;
      for (int i = 1; i < parts.length; i++) {
        String parameter = parts[i].trim().toLowerCase(Locale.ROOT);
        if (parameter.startsWith("q=")) {
          try {
            quality = Double.parseDouble(parameter.substring(2).trim());
          } catch (NumberFormatException ignored) {
            quality = 0;
          }
        }
      }
      if (coding.equals("gzip") || coding.equals("x-gzip")) {
        gzipQuality = quality;
      } else if (coding.equals("*")) {
        wildcardQuality = quality;
      }
    }
    double quality = gzipQuality >= 0 ? gzipQuality : wildcardQuality;
    return quality > 0;
  }

  private static byte[] gzip(byte[] data) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (GZIPOutputStream gzip = new GZIPOutputStream(output)) {
      gzip.write(data);
    }
    return output.toByteArray();
  }

  private record Request(
      String method,
      String target,
      String version,
      Map<String, String> headers,
      byte[] body,
      String startLine) {
    static Request empty() {
      return new Request("GET", "/", "HTTP/1.1", Map.of(), new byte[0], "");
    }

    boolean shouldClose() {
      String connection = headers.getOrDefault("connection", "").toLowerCase(Locale.ROOT);
      if (version.equals("HTTP/1.0")) {
        return !connection.contains("keep-alive");
      }
      return connection.contains("close");
    }
  }

  private static final class Response {
    final int status;
    final String reason;
    final Map<String, String> headers = new LinkedHashMap<>();
    final byte[] body;

    private Response(int status, String reason, byte[] body) {
      this.status = status;
      this.reason = reason;
      this.body = body;
    }

    static Response text(int status, String text) {
      return new Response(status, reasonFor(status), text.getBytes(StandardCharsets.UTF_8));
    }

    static Response bytes(int status, byte[] body) {
      return new Response(status, reasonFor(status), body);
    }

    private static String reasonFor(int status) {
      return switch (status) {
        case 200 -> "OK";
        case 201 -> "Created";
        case 400 -> "Bad Request";
        case 403 -> "Forbidden";
        case 404 -> "Not Found";
        case 405 -> "Method Not Allowed";
        case 500 -> "Internal Server Error";
        case 505 -> "HTTP Version Not Supported";
        default -> "Unknown";
      };
    }
  }

  private static final class BadRequestException extends IOException {
    BadRequestException(String message) {
      super(message);
    }
  }
}
