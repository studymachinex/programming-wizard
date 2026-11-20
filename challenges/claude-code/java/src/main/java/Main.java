import java.io.ByteArrayOutputStream;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

/**
 * Implementação de referência do desafio "Build your own Claude Code" (18 stages).
 *
 * Um agente de código de linha de comando: conversa com um LLM compatível com a API
 * Chat Completions, executa ferramentas (read, write, bash, skill, lsp) em loop,
 * carrega skills de .agent/skills e consulta um language server configurado em
 * .agent/lsp.json.
 *
 * Uso: your_program.sh -p "<prompt>"
 */
public class Main {
  static final PrintStream OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);
  static final int MAX_TURNS = 30;

  static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
  static String baseUrl;
  static String apiKey;
  static String model;
  static Path cwd;
  static List<Skill> skills = List.of();
  static LspClient lsp;

  record Skill(String name, String description, boolean subagent, String body, Path dir) {}

  public static void main(String[] args) throws Exception {
    String prompt = null;
    for (int i = 0; i < args.length; i++) {
      if (args[i].equals("-p") && i + 1 < args.length) prompt = args[++i];
    }
    if (prompt == null) {
      System.err.println("uso: your_program.sh -p \"<prompt>\"");
      System.exit(1);
    }

    baseUrl = env("OPENAI_BASE_URL", "https://api.openai.com/v1").replaceAll("/+$", "");
    apiKey = env("OPENAI_API_KEY", "");
    model = env("MODEL", "gpt-4o-mini");
    cwd = Path.of("").toAbsolutePath();
    skills = loadSkills(cwd.resolve(".agent").resolve("skills"));

    try {
      List<Object> messages = new ArrayList<>();
      messages.add(Json.obj("role", "system", "content", systemPrompt()));
      messages.add(Json.obj("role", "user", "content", expandSlashCommands(prompt)));
      OUT.println(runAgent(messages, tools(true)));
      OUT.flush();
    } finally {
      if (lsp != null) lsp.close();
    }
  }

  static String env(String name, String fallback) {
    String value = System.getenv(name);
    return value == null || value.isBlank() ? fallback : value;
  }

  // ----------------------------------------------------------- agent loop

  @SuppressWarnings("unchecked")
  static String runAgent(List<Object> messages, List<Object> tools) throws Exception {
    for (int turn = 0; turn < MAX_TURNS; turn++) {
      Map<String, Object> message = chat(messages, tools);
      List<Object> toolCalls = (List<Object>) message.get("tool_calls");
      Map<String, Object> assistant = new LinkedHashMap<>();
      assistant.put("role", "assistant");
      assistant.put("content", message.get("content"));
      if (toolCalls != null && !toolCalls.isEmpty()) assistant.put("tool_calls", toolCalls);
      messages.add(assistant);

      if (toolCalls == null || toolCalls.isEmpty()) {
        Object content = message.get("content");
        return content == null ? "" : content.toString();
      }
      for (Object raw : toolCalls) {
        Map<String, Object> call = (Map<String, Object>) raw;
        Map<String, Object> function = (Map<String, Object>) call.get("function");
        String name = (String) function.get("name");
        String result;
        try {
          Object arguments = function.get("arguments");
          Map<String, Object> parsed = arguments instanceof String s && !s.isBlank()
              ? Json.parseObject(s) : new HashMap<>();
          result = executeTool(name, parsed);
        } catch (Exception error) {
          result = "error: " + error.getMessage();
        }
        System.err.println("[tool] " + name + " → " + firstLine(result));
        messages.add(Json.obj("role", "tool", "tool_call_id", call.get("id"), "content", result));
      }
    }
    throw new IllegalStateException("o agente passou de " + MAX_TURNS + " turnos sem terminar");
  }

  @SuppressWarnings("unchecked")
  static Map<String, Object> chat(List<Object> messages, List<Object> tools) throws Exception {
    Map<String, Object> body = Json.obj("model", model, "messages", messages);
    if (!tools.isEmpty()) body.put("tools", tools);
    HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/chat/completions"))
        .header("Content-Type", "application/json")
        .header("Authorization", "Bearer " + apiKey)
        .timeout(Duration.ofSeconds(120))
        .POST(HttpRequest.BodyPublishers.ofString(Json.stringify(body), StandardCharsets.UTF_8))
        .build();
    HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    if (response.statusCode() != 200) {
      throw new IOException("LLM respondeu " + response.statusCode() + ": " + response.body());
    }
    Map<String, Object> parsed = Json.parseObject(response.body());
    Map<String, Object> choice = (Map<String, Object>) ((List<Object>) parsed.get("choices")).get(0);
    return (Map<String, Object>) choice.get("message");
  }

  static String firstLine(String text) {
    int newline = text.indexOf('\n');
    return newline < 0 ? text : text.substring(0, newline) + " …";
  }

  // ---------------------------------------------------------------- tools

  static List<Object> tools(boolean includeSkillTool) {
    List<Object> tools = new ArrayList<>();
    tools.add(tool("read", "Lê um arquivo do projeto e devolve o conteúdo.",
        Json.obj("path", Json.obj("type", "string", "description", "caminho relativo ao projeto")), List.of("path")));
    tools.add(tool("write", "Cria ou sobrescreve um arquivo do projeto.",
        Json.obj("path", Json.obj("type", "string"), "content", Json.obj("type", "string")), List.of("path", "content")));
    tools.add(tool("bash", "Executa um comando de shell no diretório do projeto.",
        Json.obj("command", Json.obj("type", "string")), List.of("command")));
    if (includeSkillTool && !skills.isEmpty()) {
      tools.add(tool("skill", "Carrega as instruções de uma skill disponível.",
          Json.obj("name", Json.obj("type", "string"), "arguments", Json.obj("type", "string")), List.of("name")));
    }
    if (Files.exists(lspConfig())) {
      tools.add(tool("lsp", "Consulta o language server: definition, references ou diagnostics.",
          Json.obj(
              "operation", Json.obj("type", "string", "enum", List.of("definition", "references", "diagnostics")),
              "path", Json.obj("type", "string"),
              "line", Json.obj("type", "integer", "description", "linha, começando em 1"),
              "character", Json.obj("type", "integer", "description", "coluna, começando em 1")),
          List.of("operation", "path")));
    }
    return tools;
  }

  static Map<String, Object> tool(String name, String description, Map<String, Object> properties, List<String> required) {
    return Json.obj("type", "function", "function", Json.obj(
        "name", name,
        "description", description,
        "parameters", Json.obj("type", "object", "properties", properties, "required", required)));
  }

  static String executeTool(String name, Map<String, Object> args) throws Exception {
    return switch (name) {
      case "read" -> read((String) args.get("path"));
      case "write" -> write((String) args.get("path"), (String) args.get("content"));
      case "bash" -> bash((String) args.get("command"));
      case "skill" -> invokeSkill((String) args.get("name"), (String) args.getOrDefault("arguments", ""));
      case "lsp" -> lspTool(args);
      default -> "error: ferramenta desconhecida: " + name;
    };
  }

  static String read(String path) throws IOException {
    Path file = cwd.resolve(path);
    if (!Files.isRegularFile(file)) return "error: arquivo não encontrado: " + path;
    return Files.readString(file, StandardCharsets.UTF_8);
  }

  static String write(String path, String content) throws Exception {
    Path file = cwd.resolve(path);
    if (file.getParent() != null) Files.createDirectories(file.getParent());
    Files.writeString(file, content, StandardCharsets.UTF_8);
    String result = "wrote " + content.getBytes(StandardCharsets.UTF_8).length + " bytes to " + path;
    if (Files.exists(lspConfig()) && path.endsWith(".js")) {
      List<String> diagnostics = lsp().sync(file).diagnostics(file);
      result += "\n" + formatDiagnostics(diagnostics);
    }
    return result;
  }

  static String bash(String command) throws Exception {
    boolean windows = System.getProperty("os.name").toLowerCase().contains("win");
    ProcessBuilder builder = windows
        ? new ProcessBuilder("cmd.exe", "/d", "/s", "/c", command)
        : new ProcessBuilder("sh", "-c", command);
    builder.directory(cwd.toFile()).redirectErrorStream(true);
    Process process = builder.start();
    byte[] output = process.getInputStream().readAllBytes();
    if (!process.waitFor(60, TimeUnit.SECONDS)) {
      process.destroyForcibly();
      return "error: comando passou de 60s";
    }
    return "exit code: " + process.exitValue() + "\n" + new String(output, StandardCharsets.UTF_8);
  }

  // --------------------------------------------------------------- skills

  static List<Skill> loadSkills(Path root) throws IOException {
    if (!Files.isDirectory(root)) return List.of();
    List<Skill> result = new ArrayList<>();
    try (Stream<Path> dirs = Files.list(root)) {
      for (Path dir : dirs.sorted().toList()) {
        Path file = dir.resolve("SKILL.md");
        if (!Files.isRegularFile(file)) continue;
        String text = Files.readString(file, StandardCharsets.UTF_8).replace("\r\n", "\n");
        Map<String, String> meta = new HashMap<>();
        String body = text;
        if (text.startsWith("---\n")) {
          int end = text.indexOf("\n---", 4);
          for (String line : text.substring(4, end).split("\n")) {
            int colon = line.indexOf(':');
            if (colon > 0) meta.put(line.substring(0, colon).trim(), line.substring(colon + 1).trim());
          }
          body = text.substring(text.indexOf('\n', end + 1) + 1);
        }
        String name = meta.getOrDefault("name", dir.getFileName().toString());
        result.add(new Skill(name, meta.getOrDefault("description", ""),
            "true".equalsIgnoreCase(meta.get("subagent")), body.strip(), dir.toAbsolutePath()));
      }
    }
    return result;
  }

  static String systemPrompt() {
    StringBuilder prompt = new StringBuilder(
        "You are a coding agent working in the project at " + cwd + ". Use the tools to read, write and run code.");
    if (!skills.isEmpty()) {
      prompt.append("\n\nAvailable skills (load one with the skill tool):");
      for (Skill skill : skills) prompt.append("\n- ").append(skill.name()).append(": ").append(skill.description());
    }
    return prompt.toString();
  }

  static Skill findSkill(String name) {
    for (Skill skill : skills) if (skill.name().equals(name)) return skill;
    return null;
  }

  static String render(Skill skill, String arguments) {
    String body = skill.body().replace("${SKILL_DIR}", skill.dir().toString().replace('\\', '/'));
    if (body.contains("$ARGUMENTS")) return body.replace("$ARGUMENTS", arguments);
    return arguments.isBlank() ? body : body + "\n\nARGUMENTS: " + arguments;
  }

  /** "/a /b resto" → corpo de a + corpo de b, com "resto" como argumentos. */
  static String expandSlashCommands(String prompt) {
    String rest = prompt.strip();
    List<Skill> invoked = new ArrayList<>();
    while (rest.startsWith("/")) {
      int space = rest.indexOf(' ');
      String token = (space < 0 ? rest : rest.substring(0, space)).substring(1);
      Skill skill = findSkill(token);
      if (skill == null) break;
      invoked.add(skill);
      rest = space < 0 ? "" : rest.substring(space + 1).strip();
    }
    if (invoked.isEmpty()) return prompt;
    List<String> bodies = new ArrayList<>();
    for (Skill skill : invoked) bodies.add(render(skill, rest));
    return String.join("\n\n", bodies);
  }

  static String invokeSkill(String name, String arguments) throws Exception {
    Skill skill = findSkill(name);
    if (skill == null) return "error: skill desconhecida: " + name;
    String body = render(skill, arguments == null ? "" : arguments);
    if (!skill.subagent()) return body;
    // Subagente: conversa nova, só com as instruções da skill; volta apenas o resultado final.
    List<Object> messages = new ArrayList<>();
    messages.add(Json.obj("role", "system", "content",
        "You are a subagent. Complete the task below and reply with the final result only."));
    messages.add(Json.obj("role", "user", "content", body));
    return runAgent(messages, tools(false));
  }

  // ------------------------------------------------------------------ LSP

  static Path lspConfig() {
    return cwd.resolve(".agent").resolve("lsp.json");
  }

  @SuppressWarnings("unchecked")
  static LspClient lsp() throws Exception {
    if (lsp == null) {
      Map<String, Object> config = Json.parseObject(Files.readString(lspConfig(), StandardCharsets.UTF_8));
      List<String> command = new ArrayList<>();
      command.add((String) config.get("command"));
      for (Object arg : (List<Object>) config.getOrDefault("args", List.of())) command.add((String) arg);
      lsp = new LspClient(command, cwd);
    }
    return lsp;
  }

  @SuppressWarnings("unchecked")
  static String lspTool(Map<String, Object> args) throws Exception {
    String operation = (String) args.get("operation");
    Path file = cwd.resolve((String) args.get("path"));
    LspClient client = lsp().sync(file);
    if (operation.equals("diagnostics")) return formatDiagnostics(client.diagnostics(file));

    int line = ((Number) args.getOrDefault("line", 1L)).intValue() - 1;
    int character = ((Number) args.getOrDefault("character", 1L)).intValue() - 1;
    Map<String, Object> params = Json.obj(
        "textDocument", Json.obj("uri", LspClient.uri(file)),
        "position", Json.obj("line", line, "character", character));
    String method = switch (operation) {
      case "definition" -> "textDocument/definition";
      case "references" -> {
        params.put("context", Json.obj("includeDeclaration", false));
        yield "textDocument/references";
      }
      default -> throw new IllegalArgumentException("operação desconhecida: " + operation);
    };
    Object result = client.request(method, params);
    List<Object> locations = result instanceof List<?> list ? (List<Object>) list
        : result == null ? List.of() : List.of(result);
    if (locations.isEmpty()) return "no results";
    List<String> lines = new ArrayList<>();
    for (Object raw : locations) {
      Map<String, Object> location = (Map<String, Object>) raw;
      Map<String, Object> start = (Map<String, Object>) ((Map<String, Object>) location.get("range")).get("start");
      Path target = Path.of(URI.create((String) location.get("uri")));
      String relative = cwd.relativize(target).toString().replace('\\', '/');
      lines.add(relative + ":" + (((Number) start.get("line")).intValue() + 1) + ":"
          + (((Number) start.get("character")).intValue() + 1));
    }
    return String.join("\n", lines);
  }

  static String formatDiagnostics(List<String> diagnostics) {
    return diagnostics.isEmpty() ? "diagnostics: none" : "diagnostics:\n" + String.join("\n", diagnostics);
  }

  /** Cliente LSP mínimo: JSON-RPC sobre stdio com cabeçalho Content-Length. */
  static final class LspClient {
    final Process process;
    final OutputStream in;
    final Path root;
    final AtomicInteger ids = new AtomicInteger();
    final Map<Integer, CompletableFuture<Object>> pending = new HashMap<>();
    final Map<String, Integer> versions = new HashMap<>();
    final Map<String, String> synced = new HashMap<>();
    final Map<String, List<String>> diagnostics = new HashMap<>();
    final Map<String, Integer> diagnosticVersions = new HashMap<>();

    LspClient(List<String> command, Path root) throws Exception {
      this.root = root;
      process = new ProcessBuilder(command).directory(root.toFile())
          .redirectError(ProcessBuilder.Redirect.INHERIT).start();
      in = process.getOutputStream();
      Thread reader = new Thread(() -> readLoop(process.getInputStream()), "lsp-reader");
      reader.setDaemon(true);
      reader.start();
      request("initialize", Json.obj("processId", ProcessHandle.current().pid(),
          "rootUri", uri(root), "capabilities", Json.obj()));
      notify("initialized", Json.obj());
    }

    static String uri(Path path) {
      return path.toAbsolutePath().normalize().toUri().toString();
    }

    /** Abre o documento (didOpen) ou envia o conteúdo novo (didChange) se mudou no disco. */
    LspClient sync(Path file) throws Exception {
      String uri = uri(file);
      String text = Files.isRegularFile(file) ? Files.readString(file, StandardCharsets.UTF_8) : "";
      if (!versions.containsKey(uri)) {
        versions.put(uri, 1);
        notify("textDocument/didOpen", Json.obj("textDocument",
            Json.obj("uri", uri, "languageId", "javascript", "version", 1, "text", text)));
      } else if (!text.equals(synced.get(uri))) {
        int version = versions.merge(uri, 1, Integer::sum);
        notify("textDocument/didChange", Json.obj(
            "textDocument", Json.obj("uri", uri, "version", version),
            "contentChanges", List.of(Json.obj("text", text))));
      }
      synced.put(uri, text);
      return this;
    }

    /** Espera os diagnostics da versão atual do documento (até 3 s). */
    List<String> diagnostics(Path file) throws InterruptedException {
      String uri = uri(file);
      int version = versions.getOrDefault(uri, 0);
      long deadline = System.currentTimeMillis() + 3000;
      synchronized (this) {
        while (diagnosticVersions.getOrDefault(uri, -1) < version && System.currentTimeMillis() < deadline) {
          wait(100);
        }
        return diagnostics.getOrDefault(uri, List.of());
      }
    }

    Object request(String method, Map<String, Object> params) throws Exception {
      int id = ids.incrementAndGet();
      CompletableFuture<Object> future = new CompletableFuture<>();
      synchronized (this) {
        pending.put(id, future);
      }
      send(Json.obj("jsonrpc", "2.0", "id", id, "method", method, "params", params));
      return future.get(10, TimeUnit.SECONDS);
    }

    void notify(String method, Map<String, Object> params) throws IOException {
      send(Json.obj("jsonrpc", "2.0", "method", method, "params", params));
    }

    synchronized void send(Map<String, Object> message) throws IOException {
      byte[] body = Json.stringify(message).getBytes(StandardCharsets.UTF_8);
      in.write(("Content-Length: " + body.length + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
      in.write(body);
      in.flush();
    }

    @SuppressWarnings("unchecked")
    void readLoop(InputStream stream) {
      try {
        while (true) {
          int length = -1;
          String header;
          while (!(header = readLine(stream)).isEmpty()) {
            if (header.toLowerCase().startsWith("content-length:")) length = Integer.parseInt(header.substring(15).trim());
          }
          if (length < 0) return;
          byte[] body = stream.readNBytes(length);
          Map<String, Object> message = Json.parseObject(new String(body, StandardCharsets.UTF_8));
          synchronized (this) {
            if (message.containsKey("id") && !message.containsKey("method")) {
              CompletableFuture<Object> future = pending.remove(((Number) message.get("id")).intValue());
              if (future != null) {
                if (message.get("error") != null) future.completeExceptionally(new IOException(Json.stringify(message.get("error"))));
                else future.complete(message.get("result"));
              }
            } else if ("textDocument/publishDiagnostics".equals(message.get("method"))) {
              Map<String, Object> params = (Map<String, Object>) message.get("params");
              String uri = canonical((String) params.get("uri"));
              List<String> lines = new ArrayList<>();
              for (Object raw : (List<Object>) params.get("diagnostics")) {
                Map<String, Object> d = (Map<String, Object>) raw;
                Map<String, Object> start = (Map<String, Object>) ((Map<String, Object>) d.get("range")).get("start");
                lines.add((((Number) start.get("line")).intValue() + 1) + ":"
                    + (((Number) start.get("character")).intValue() + 1) + ": " + d.get("message"));
              }
              diagnostics.put(uri, lines);
              Object version = params.get("version");
              diagnosticVersions.put(uri, version instanceof Number n ? n.intValue() : versions.getOrDefault(uri, 0));
              notifyAll();
            }
          }
        }
      } catch (IOException | RuntimeException error) {
        // servidor encerrou
      }
    }

    String canonical(String uri) {
      return uri(Path.of(URI.create(uri)));
    }

    static String readLine(InputStream stream) throws IOException {
      ByteArrayOutputStream line = new ByteArrayOutputStream();
      int b;
      while ((b = stream.read()) != -1) {
        if (b == '\n') break;
        if (b != '\r') line.write(b);
      }
      if (b == -1 && line.size() == 0) throw new IOException("fim do stream");
      return line.toString(StandardCharsets.US_ASCII);
    }

    void close() {
      try {
        request("shutdown", Json.obj());
        notify("exit", Json.obj());
      } catch (Exception ignored) {
        // melhor esforço
      }
      process.destroy();
    }
  }
}
