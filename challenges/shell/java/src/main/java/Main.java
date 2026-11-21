import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * Build your own Shell — implementação de referência.
 *
 * Um shell POSIX simplificado: REPL, builtins (echo, exit, type, pwd, cd, history, jobs,
 * complete, declare), execução de programas do PATH, quoting, redirecionamento, pipelines,
 * jobs em background, histórico persistente, expansão de variáveis e autocompletar.
 */
public class Main {
  static final boolean WINDOWS = System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win");
  static final List<String> BUILTINS =
      List.of("cd", "complete", "declare", "echo", "exit", "history", "jobs", "pwd", "type");
  static final String PROMPT = "$ ";

  static final PrintStream OUT = new PrintStream(new FileOutputStream(java.io.FileDescriptor.out), false, StandardCharsets.UTF_8);
  static final PrintStream ERR = new PrintStream(new FileOutputStream(java.io.FileDescriptor.err), false, StandardCharsets.UTF_8);

  static Path cwd = Paths.get("").toAbsolutePath();
  static final Map<String, String> variables = new HashMap<>();
  static final Map<String, String> completers = new TreeMap<>();
  static final List<String> history = new ArrayList<>();
  static int historyAppended = 0;

  record Job(int number, String command, Process process, long order) {}

  static final List<Job> jobs = new ArrayList<>();
  static long jobCounter = 0;

  public static void main(String[] args) throws IOException {
    loadHistoryFile();
    LineEditor editor = new LineEditor(System.in, OUT, Main::complete, history);
    while (true) {
      OUT.print(PROMPT);
      OUT.flush();
      String line = editor.readLine(PROMPT);
      if (line == null) exitShell(0);
      if (!line.isBlank()) {
        history.add(line);
        runLine(line);
      }
      reapJobs();
      OUT.flush();
      ERR.flush();
    }
  }

  // ------------------------------------------------------------------ execução

  static void runLine(String line) {
    Parser.Pipeline pipeline;
    try {
      pipeline = Parser.parse(line, Main::lookupVariable);
    } catch (Parser.ParseException e) {
      ERR.println("shell: " + e.getMessage());
      return;
    }
    if (pipeline.commands.isEmpty()) return;
    try {
      if (pipeline.background) startJob(line, pipeline.commands.get(0));
      else if (pipeline.commands.size() == 1) runSingle(pipeline.commands.get(0));
      else runPipeline(pipeline.commands);
    } catch (IOException e) {
      ERR.println("shell: " + e.getMessage());
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  static void runSingle(Parser.Command command) throws IOException, InterruptedException {
    String name = command.argv.get(0);
    if (BUILTINS.contains(name)) {
      try (PrintStream out = openRedirect(command.stdout, command.stdoutAppend, OUT);
          PrintStream err = openRedirect(command.stderr, command.stderrAppend, ERR)) {
        runBuiltin(command.argv, out, err);
      }
      return;
    }
    Path executable = findExecutable(name);
    if (executable == null) {
      try (PrintStream err = openRedirect(command.stderr, command.stderrAppend, ERR)) {
        err.println(name + ": command not found");
      }
      return;
    }
    ProcessBuilder builder = processFor(executable, command);
    builder.redirectInput(ProcessBuilder.Redirect.INHERIT);
    builder.redirectOutput(redirectFor(command.stdout, command.stdoutAppend));
    builder.redirectError(redirectFor(command.stderr, command.stderrAppend));
    OUT.flush();
    ERR.flush();
    builder.start().waitFor();
  }

  static void runPipeline(List<Parser.Command> commands) throws IOException, InterruptedException {
    List<Process> processes = new ArrayList<>();
    List<Thread> threads = new ArrayList<>();
    InputStream previous = null;
    OUT.flush();
    ERR.flush();
    for (int i = 0; i < commands.size(); i++) {
      Parser.Command command = commands.get(i);
      boolean last = i == commands.size() - 1;
      String name = command.argv.get(0);

      if (BUILTINS.contains(name)) {
        if (previous != null) threads.add(pump(previous, OutputStream.nullOutputStream()));
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        PrintStream fallback = last ? OUT : new PrintStream(buffer, true, StandardCharsets.UTF_8);
        try (PrintStream out = openRedirect(command.stdout, command.stdoutAppend, fallback);
            PrintStream err = openRedirect(command.stderr, command.stderrAppend, ERR)) {
          runBuiltin(command.argv, out, err);
        }
        OUT.flush();
        previous = last ? null : new ByteArrayInputStream(buffer.toByteArray());
        continue;
      }

      Path executable = findExecutable(name);
      if (executable == null) {
        ERR.println(name + ": command not found");
        ERR.flush();
        if (previous != null) threads.add(pump(previous, OutputStream.nullOutputStream()));
        previous = last ? null : new ByteArrayInputStream(new byte[0]);
        continue;
      }
      ProcessBuilder builder = processFor(executable, command);
      builder.redirectInput(i == 0 ? ProcessBuilder.Redirect.INHERIT : ProcessBuilder.Redirect.PIPE);
      builder.redirectOutput(last ? redirectFor(command.stdout, command.stdoutAppend) : ProcessBuilder.Redirect.PIPE);
      builder.redirectError(redirectFor(command.stderr, command.stderrAppend));
      Process process = builder.start();
      processes.add(process);
      if (previous != null) threads.add(pump(previous, process.getOutputStream()));
      previous = last ? null : process.getInputStream();
    }
    for (Process process : processes) process.waitFor();
    for (Thread thread : threads) thread.join(2000);
  }

  /** Copia in → out numa thread; se o destino fechar (ex.: head terminou), fecha a origem também. */
  static Thread pump(InputStream in, OutputStream out) {
    Thread thread = new Thread(() -> {
      try (in; out) {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) != -1) {
          out.write(buffer, 0, read);
          out.flush(); // sem flush o próximo comando só veria os dados no fim
        }
      } catch (IOException ignored) {
        // o leitor terminou antes: fechar `in` faz o escritor receber EPIPE e encerrar
      }
    });
    thread.setDaemon(true);
    thread.start();
    return thread;
  }

  static ProcessBuilder processFor(Path executable, Parser.Command command) {
    List<String> argv = new ArrayList<>(command.argv);
    argv.set(0, executable.toString());
    return new ProcessBuilder(argv).directory(cwd.toFile());
  }

  static ProcessBuilder.Redirect redirectFor(String target, boolean append) {
    if (target == null) return ProcessBuilder.Redirect.INHERIT;
    File file = cwd.resolve(target).toFile();
    return append ? ProcessBuilder.Redirect.appendTo(file) : ProcessBuilder.Redirect.to(file);
  }

  static PrintStream openRedirect(String target, boolean append, PrintStream fallback) throws IOException {
    if (target == null) {
      return new PrintStream(fallback, true, StandardCharsets.UTF_8) {
        @Override
        public void close() {
          flush(); // não fecha o stdout/stderr do shell
        }
      };
    }
    return new PrintStream(new FileOutputStream(cwd.resolve(target).toFile(), append), true, StandardCharsets.UTF_8);
  }

  // ---------------------------------------------------------------- builtins

  static void runBuiltin(List<String> argv, PrintStream out, PrintStream err) {
    List<String> args = argv.subList(1, argv.size());
    switch (argv.get(0)) {
      case "exit" -> {
        out.flush();
        exitShell(args.isEmpty() ? 0 : parseIntOr(args.get(0), 0));
      }
      case "echo" -> out.println(String.join(" ", args));
      case "type" -> {
        for (String name : args) {
          if (BUILTINS.contains(name)) out.println(name + " is a shell builtin");
          else {
            Path executable = findExecutable(name);
            if (executable != null) out.println(name + " is " + executable);
            else err.println(name + ": not found");
          }
        }
      }
      case "pwd" -> out.println(cwd);
      case "cd" -> changeDirectory(args.isEmpty() ? "~" : args.get(0), err);
      case "history" -> history(args, out, err);
      case "jobs" -> listJobs(out);
      case "complete" -> complete(args, out, err);
      case "declare" -> declare(args, out, err);
      default -> err.println(argv.get(0) + ": command not found");
    }
  }

  static void changeDirectory(String target, PrintStream err) {
    String home = System.getenv("HOME");
    String resolved = target;
    if (home != null && (target.equals("~") || target.startsWith("~/"))) resolved = home + target.substring(1);
    try {
      Path path = cwd.resolve(resolved).normalize();
      if (Files.isDirectory(path)) {
        cwd = path;
        return;
      }
    } catch (InvalidPathException ignored) {
      // cai na mensagem de erro
    }
    err.println("cd: " + target + ": No such file or directory");
  }

  static void history(List<String> args, PrintStream out, PrintStream err) {
    if (args.size() >= 2 && args.get(0).startsWith("-")) {
      Path file = cwd.resolve(args.get(1));
      try {
        switch (args.get(0)) {
          case "-r" -> {
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
              if (!line.isBlank()) history.add(line);
            }
          }
          case "-w" -> {
            Files.writeString(file, joinLines(history), StandardCharsets.UTF_8);
            historyAppended = history.size();
          }
          case "-a" -> {
            Files.writeString(file, joinLines(history.subList(historyAppended, history.size())),
                StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            historyAppended = history.size();
          }
          default -> err.println("history: " + args.get(0) + ": invalid option");
        }
      } catch (IOException e) {
        err.println("history: " + args.get(1) + ": " + e.getMessage());
      }
      return;
    }
    int start = 0;
    if (!args.isEmpty()) start = Math.max(0, history.size() - parseIntOr(args.get(0), history.size()));
    for (int i = start; i < history.size(); i++) out.printf("%5d  %s%n", i + 1, history.get(i));
  }

  static void complete(List<String> args, PrintStream out, PrintStream err) {
    if (args.size() >= 3 && args.get(0).equals("-C")) {
      completers.put(args.get(2), args.get(1));
    } else if (args.size() >= 2 && args.get(0).equals("-p")) {
      String path = completers.get(args.get(1));
      if (path == null) err.println("complete: " + args.get(1) + ": no completion specification");
      else out.println("complete -C '" + path + "' " + args.get(1));
    } else if (args.size() >= 2 && args.get(0).equals("-r")) {
      if (completers.remove(args.get(1)) == null) {
        err.println("complete: " + args.get(1) + ": no completion specification");
      }
    } else {
      err.println("complete: uso: complete -C <comando> <nome> | -p <nome> | -r <nome>");
    }
  }

  static void declare(List<String> args, PrintStream out, PrintStream err) {
    if (!args.isEmpty() && args.get(0).equals("-p")) {
      for (String name : args.subList(1, args.size())) {
        if (variables.containsKey(name)) out.println("declare -- " + name + "=\"" + escape(variables.get(name)) + "\"");
        else if (System.getenv(name) != null) out.println("declare -x " + name + "=\"" + escape(System.getenv(name)) + "\"");
        else err.println("declare: " + name + ": not found");
      }
      return;
    }
    for (String arg : args) {
      int eq = arg.indexOf('=');
      String name = eq < 0 ? arg : arg.substring(0, eq);
      if (!Parser.isValidName(name)) {
        err.println("declare: '" + arg + "': not a valid identifier");
        continue;
      }
      variables.put(name, eq < 0 ? variables.getOrDefault(name, "") : arg.substring(eq + 1));
    }
  }

  static String escape(String value) {
    StringBuilder sb = new StringBuilder();
    for (char c : value.toCharArray()) {
      if (c == '"' || c == '\\' || c == '$' || c == '`') sb.append('\\');
      sb.append(c);
    }
    return sb.toString();
  }

  static String lookupVariable(String name) {
    if (variables.containsKey(name)) return variables.get(name);
    String value = System.getenv(name);
    return value == null ? "" : value;
  }

  // -------------------------------------------------------------------- jobs

  static void startJob(String line, Parser.Command command) throws IOException {
    String name = command.argv.get(0);
    Path executable = findExecutable(name);
    if (executable == null) {
      ERR.println(name + ": command not found");
      return;
    }
    ProcessBuilder builder = processFor(executable, command);
    builder.redirectInput(new File(WINDOWS ? "NUL" : "/dev/null"));
    builder.redirectOutput(redirectFor(command.stdout, command.stdoutAppend));
    builder.redirectError(redirectFor(command.stderr, command.stderrAppend));
    OUT.flush();
    Process process = builder.start();
    int number = jobs.stream().mapToInt(Job::number).max().orElse(0) + 1;
    String text = line.trim();
    text = text.substring(0, text.length() - 1).trim(); // sem o '&'
    jobs.add(new Job(number, text, process, ++jobCounter));
    OUT.println("[" + number + "] " + process.pid());
  }

  /** '+' para o job mais recente, '-' para o anterior, ' ' para os demais. */
  static Map<Integer, Character> markers() {
    List<Job> byOrder = new ArrayList<>(jobs);
    byOrder.sort(Comparator.comparingLong(Job::order));
    Map<Integer, Character> markers = new HashMap<>();
    for (Job job : jobs) markers.put(job.number(), ' ');
    if (!byOrder.isEmpty()) markers.put(byOrder.get(byOrder.size() - 1).number(), '+');
    if (byOrder.size() > 1) markers.put(byOrder.get(byOrder.size() - 2).number(), '-');
    return markers;
  }

  static String formatJob(Job job, char marker, boolean running) {
    String status = running ? "Running" : "Done";
    return String.format("[%d]%c  %-24s%s", job.number(), marker, status, job.command() + (running ? " &" : ""));
  }

  static void listJobs(PrintStream out) {
    Map<Integer, Character> markers = markers();
    List<Job> sorted = new ArrayList<>(jobs);
    sorted.sort(Comparator.comparingInt(Job::number));
    List<Job> done = new ArrayList<>();
    for (Job job : sorted) {
      boolean running = job.process().isAlive();
      out.println(formatJob(job, markers.get(job.number()), running));
      if (!running) done.add(job);
    }
    jobs.removeAll(done);
  }

  static void reapJobs() {
    Map<Integer, Character> markers = markers();
    List<Job> sorted = new ArrayList<>(jobs);
    sorted.sort(Comparator.comparingInt(Job::number));
    for (Job job : sorted) {
      if (job.process().isAlive()) continue;
      OUT.println(formatJob(job, markers.get(job.number()), false));
      jobs.remove(job);
    }
  }

  // ----------------------------------------------------------------- histórico

  static Path historyFile() {
    String value = System.getenv("HISTFILE");
    return value == null || value.isEmpty() ? null : cwd.resolve(value);
  }

  static void loadHistoryFile() {
    Path file = historyFile();
    if (file == null || !Files.isRegularFile(file)) return;
    try {
      for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
        if (!line.isBlank()) history.add(line);
      }
    } catch (IOException ignored) {
      // histórico ilegível: começa vazio
    }
    historyAppended = history.size();
  }

  static void exitShell(int code) {
    Path file = historyFile();
    if (file != null) {
      try {
        Files.writeString(file, joinLines(history.subList(historyAppended, history.size())),
            StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
      } catch (IOException e) {
        ERR.println("shell: não consegui salvar o histórico: " + e.getMessage());
      }
    }
    OUT.flush();
    ERR.flush();
    System.exit(code);
  }

  static String joinLines(List<String> lines) {
    StringBuilder sb = new StringBuilder();
    for (String line : lines) sb.append(line).append('\n');
    return sb.toString();
  }

  // ------------------------------------------------------------- executáveis

  static List<String> pathExtensions() {
    String value = System.getenv("PATHEXT");
    if (value == null || value.isBlank()) value = ".COM;.EXE;.BAT;.CMD";
    List<String> extensions = new ArrayList<>();
    for (String ext : value.split(";")) if (!ext.isBlank()) extensions.add(ext.toLowerCase(Locale.ROOT));
    return extensions;
  }

  static List<Path> pathDirectories() {
    List<Path> dirs = new ArrayList<>();
    String path = System.getenv("PATH");
    if (path == null) return dirs;
    for (String entry : path.split(File.pathSeparator)) {
      if (entry.isEmpty()) continue;
      try {
        dirs.add(Paths.get(entry));
      } catch (InvalidPathException ignored) {
        // entrada inválida no PATH
      }
    }
    return dirs;
  }

  /** No Unix: arquivo comum com permissão de execução. No Windows: nome + extensão do PATHEXT. */
  static Path executableIn(Path dir, String name) {
    if (!WINDOWS) {
      Path candidate = dir.resolve(name);
      return Files.isRegularFile(candidate) && Files.isExecutable(candidate) ? candidate : null;
    }
    String lower = name.toLowerCase(Locale.ROOT);
    for (String ext : pathExtensions()) {
      if (lower.endsWith(ext) && Files.isRegularFile(dir.resolve(name))) return dir.resolve(name);
    }
    for (String ext : pathExtensions()) {
      Path candidate = dir.resolve(name + ext);
      if (Files.isRegularFile(candidate)) return candidate;
    }
    return null;
  }

  static Path findExecutable(String name) {
    try {
      if (name.contains("/") || (WINDOWS && name.contains("\\"))) {
        Path path = cwd.resolve(name);
        return executableIn(path.getParent(), path.getFileName().toString());
      }
      for (Path dir : pathDirectories()) {
        Path found = executableIn(dir, name);
        if (found != null) return found;
      }
    } catch (InvalidPathException ignored) {
      // nome com caracteres inválidos para o sistema de arquivos
    }
    return null;
  }

  static TreeSet<String> executableNames() {
    TreeSet<String> names = new TreeSet<>();
    List<String> extensions = pathExtensions();
    for (Path dir : pathDirectories()) {
      if (!Files.isDirectory(dir)) continue;
      try (DirectoryStream<Path> entries = Files.newDirectoryStream(dir)) {
        for (Path entry : entries) {
          String file = entry.getFileName().toString();
          if (!Files.isRegularFile(entry)) continue;
          if (!WINDOWS) {
            if (Files.isExecutable(entry)) names.add(file);
            continue;
          }
          String lower = file.toLowerCase(Locale.ROOT);
          for (String ext : extensions) {
            if (lower.endsWith(ext)) {
              names.add(file.substring(0, file.length() - ext.length()));
              break;
            }
          }
        }
      } catch (IOException ignored) {
        // diretório ilegível
      }
    }
    return names;
  }

  // ------------------------------------------------------------ autocompletar

  static LineEditor.Completion complete(String line) {
    int space = line.lastIndexOf(' ');
    String word = line.substring(space + 1);
    List<LineEditor.Candidate> candidates = new ArrayList<>();
    if (space < 0) {
      TreeSet<String> names = new TreeSet<>(BUILTINS);
      names.addAll(executableNames());
      for (String name : names) {
        if (name.startsWith(word)) candidates.add(new LineEditor.Candidate(name, name, false));
      }
      return new LineEditor.Completion(word, candidates);
    }
    String command = line.substring(0, line.indexOf(' '));
    if (completers.containsKey(command)) {
      return new LineEditor.Completion(word, programmable(command, line, word));
    }
    return new LineEditor.Completion(word, files(word));
  }

  static List<LineEditor.Candidate> files(String word) {
    int slash = word.lastIndexOf('/');
    String dirPart = word.substring(0, slash + 1);
    String base = word.substring(slash + 1);
    List<LineEditor.Candidate> candidates = new ArrayList<>();
    try {
      Path dir = cwd.resolve(dirPart.isEmpty() ? "." : dirPart);
      if (!Files.isDirectory(dir)) return candidates;
      TreeMap<String, Boolean> entries = new TreeMap<>();
      try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
        for (Path entry : stream) {
          String name = entry.getFileName().toString();
          if (name.startsWith(base) && (base.startsWith(".") || !name.startsWith("."))) {
            entries.put(name, Files.isDirectory(entry));
          }
        }
      }
      entries.forEach((name, isDir) ->
          candidates.add(new LineEditor.Candidate(dirPart + name, name + (isDir ? "/" : ""), isDir)));
    } catch (IOException | InvalidPathException ignored) {
      // sem candidatos
    }
    return candidates;
  }

  static List<LineEditor.Candidate> programmable(String command, String line, String word) {
    String[] words = line.substring(0, line.length() - word.length()).trim().split(" +");
    String previous = words[words.length - 1];
    List<LineEditor.Candidate> candidates = new ArrayList<>();
    try {
      String completer = completers.get(command);
      Path executable = findExecutable(completer);
      List<String> argv = List.of(executable != null ? executable.toString() : completer, command, word, previous);
      ProcessBuilder builder = new ProcessBuilder(argv).directory(cwd.toFile());
      builder.environment().put("COMP_LINE", line);
      builder.environment().put("COMP_POINT", String.valueOf(line.length()));
      builder.redirectInput(new File(WINDOWS ? "NUL" : "/dev/null"));
      builder.redirectError(ProcessBuilder.Redirect.DISCARD);
      Process process = builder.start();
      String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
      process.waitFor();
      TreeSet<String> unique = new TreeSet<>();
      for (String candidate : output.split("\r?\n")) if (!candidate.isEmpty()) unique.add(candidate);
      for (String candidate : unique) candidates.add(new LineEditor.Candidate(candidate, candidate, false));
    } catch (IOException e) {
      // completer não pôde ser executado: nenhum candidato
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
    return candidates;
  }

  static int parseIntOr(String value, int fallback) {
    try {
      return Integer.parseInt(value.trim());
    } catch (NumberFormatException e) {
      return fallback;
    }
  }
}
