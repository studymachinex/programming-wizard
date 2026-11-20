import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Build your own Claude Code — um agente de código de linha de comando.
 *
 *   ./your_program.sh -p "<prompt>"
 *
 * O LLM é qualquer API compatível com Chat Completions:
 *   OPENAI_BASE_URL  (ex.: https://api.openai.com/v1 ou https://openrouter.ai/api/v1)
 *   OPENAI_API_KEY
 *   MODEL
 *
 * Nos testes, essas variáveis apontam para um LLM falso do tester — nenhuma API paga é usada.
 * Json.java (nesta pasta) resolve parse/stringify de JSON. Rode `npm run cc -- task`.
 */
public class Main {
  static final PrintStream OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);

  public static void main(String[] args) throws Exception {
    String prompt = null;
    for (int i = 0; i < args.length; i++) {
      if (args[i].equals("-p") && i + 1 < args.length) prompt = args[++i];
    }
    if (prompt == null) {
      System.err.println("uso: your_program.sh -p \"<prompt>\"");
      System.exit(1);
    }

    String baseUrl = System.getenv().getOrDefault("OPENAI_BASE_URL", "https://api.openai.com/v1");
    String apiKey = System.getenv().getOrDefault("OPENAI_API_KEY", "");
    String model = System.getenv().getOrDefault("MODEL", "gpt-4o-mini");

    // TODO (stage 1): envie o prompt para o LLM e imprima a resposta. Descomente:
    //
    // Map<String, Object> body = Json.obj(
    //     "model", model,
    //     "messages", List.of(Json.obj("role", "user", "content", prompt)));
    // HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/chat/completions"))
    //     .header("Content-Type", "application/json")
    //     .header("Authorization", "Bearer " + apiKey)
    //     .POST(HttpRequest.BodyPublishers.ofString(Json.stringify(body)))
    //     .build();
    // HttpResponse<String> response = HttpClient.newHttpClient()
    //     .send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    // Map<String, Object> parsed = Json.parseObject(response.body());
    // Map<String, Object> choice = (Map<String, Object>) ((List<Object>) parsed.get("choices")).get(0);
    // Map<String, Object> message = (Map<String, Object>) choice.get("message");
    // OUT.println(message.get("content"));
    // OUT.flush();
    System.err.println("agente ainda não implementado (modelo: " + model + ", base: " + baseUrl + ")");
    System.exit(1);
  }
}
