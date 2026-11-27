# Motor de cenas: especificação técnica

## 1. Estrutura de arquivos

```text
lib/scenes/
  types.ts            tipos públicos (seção 2)
  registry.ts         "<trilha>/<aula>" -> import dinâmico (seção 7)
  diff.ts             "O que mudou" automático (seção 5)
  terminal.ts         resolvedor de comandos do terminal simulado (seção 6)
  iso.ts              projeção isométrica, âncoras, bounds (seção 3.1)
  kit/
    common.ts         builders genéricos: zone, box, users, link, flow
    k8s.ts            presets de Kubernetes: node, pod, controlPlane, service, ingress
    docker.ts         presets de Docker: host, container, network, volume
    net.ts            presets de redes: client, router, switch, server, lanes comuns
  <trilha>/<arquivo>.ts   as cenas (um arquivo por módulo, vários exports)
components/scenes/
  lesson-scene.tsx    carrega a cena da aula e mostra skeleton (client)
  scene-player.tsx    player: estado do passo, teclado, URL, progresso local
  iso-stage.tsx       renderizador isométrico (SVG)
  sequence-stage.tsx  renderizador de diagrama de sequência (SVG)
  layers-stage.tsx    renderizador de camadas/encapsulamento (HTML + CSS)
  flows.tsx           partículas animadas ao longo de caminhos
  scene-terminal.tsx  terminal simulado
  step-text.tsx       texto do passo com markdown inline (**negrito** e `código`)
scripts/check-scenes.ts
```

Adicione `"check:scenes": "tsx scripts/check-scenes.ts"` em `package.json`.

## 2. Tipos (`lib/scenes/types.ts`)

```ts
import type { Panel } from "@/lib/visualizers/types";

export type StepKind = "contexto" | "problema" | "solucao" | "conceito" | "tradeoff" | "resumo";

/** Estado visual de um elemento. */
export type Status = "ok" | "new" | "warn" | "bad" | "dead" | "muted" | "hi";

/** Paleta de cores dos elementos (mapeada para os tokens da plataforma, seção 3.4). */
export type Tone = "arcane" | "mana" | "rune" | "ember" | "rose" | "sky" | "zinc" | "violet";

export type Badge = { text: string; tone?: "ok" | "warn" | "bad" | "info" };

export type Metric = {
  id: string;                 // estável entre passos, para o diff
  label: string;              // "Pods da API", "Erros", "Latência"
  value: string | number;
  tone?: "ok" | "warn" | "bad";
};

export type Callout = { kind: "chave" | "atencao" | "bom-saber"; text: string };

/** Metadados para o terminal gerar saída a partir da cena (seção 6.2). */
export type Resource = {
  kind: "pod" | "node" | "service" | "deployment" | "container" | "image" | "volume" | "network";
  name: string;
  namespace?: string;
  status?: string;            // "Running", "CrashLoopBackOff", "Up 3 minutes", ...
  ready?: string;             // "1/1"
  restarts?: number;
  ip?: string;
  node?: string;
  image?: string;
  ports?: string;             // "80:8080/TCP", "0.0.0.0:8080->8080/tcp"
  type?: string;              // tipo do Service: ClusterIP, NodePort...
  age?: string;               // "5d", "3m"
};

// ---------- modo isométrico ----------

export type IsoZone = {
  id: string; type: "zone";
  x: number; y: number;       // canto de trás, em unidades de grade
  w: number; d: number;       // largura (eixo x) e profundidade (eixo y)
  th?: number;                // espessura em px (padrão 10)
  z?: number;                 // elevação da base em px (padrão 0)
  label?: string;             // pílula no canto da frente
  tone?: Tone;                // padrão "zinc"
  status?: Status;
  dashed?: boolean;           // borda tracejada (namespace, rede lógica)
};

export type IsoBox = {
  id: string; type: "box";
  x: number; y: number;       // centro da base, em unidades de grade
  parent?: string;            // id de uma zona: x/y passam a ser relativos ao canto da zona e z ao topo dela
  z?: number;
  size?: "sm" | "md" | "lg";  // aresta da base: 1.2 / 1.6 / 2.2 unidades; altura 18 / 26 / 34 px
  icon: IconName;             // seção 3.5
  label: string;
  tone?: Tone;
  status?: Status;
  badges?: Badge[];           // até 2, empilhados acima do cubo
  meter?: number;             // 0–100: barrinha de uso (CPU, memória) acima do cubo
  res?: Resource;             // opcional, para o terminal
};

export type IsoUsers = {
  id: string; type: "users";
  x: number; y: number;
  count: number;              // 1–9 bonequinhos
  label?: string;
};

export type IsoEntity = IsoZone | IsoBox | IsoUsers;

export type IsoLink = {
  from: string; to: string;   // ids de box/users/zone
  style?: "solid" | "dashed";
  tone?: Tone;
  label?: string;
};

export type FlowKind = "req" | "heavy" | "bad" | "hc" | "data";

export type IsoFlow = {
  from: string; to: string;
  via?: string[];             // ids intermediários (ex.: usuário -> ingress -> service -> pod)
  rate: 1 | 2 | 3 | 4;        // partículas simultâneas no caminho
  kind?: FlowKind;            // padrão "req"
  label?: string;             // aparece no meio do caminho (ex.: "probe falhou")
};

export type IsoStage = {
  mode: "iso";
  entities: IsoEntity[];
  links?: IsoLink[];
  flows?: IsoFlow[];
};

// ---------- modo sequência ----------

export type SeqLane = { id: string; label: string; icon?: IconName; tone?: Tone };

export type SeqMessage = {
  id: string;                 // estável entre passos: mensagens já vistas aparecem estáticas
  from: string; to: string;   // ids de lane (from === to é permitido: processamento local, desenha laço)
  at: number;                 // linha (0, 1, 2...)
  span?: number;              // linhas que a seta "desce" (latência visível); padrão 0 = horizontal
  label: string;              // "SYN seq=100"
  detail?: string;            // linha pequena em mono abaixo ("MSS=1460, janela=64240")
  tone?: "ok" | "bad" | "data" | "ctrl";  // padrão "ctrl"
  lost?: boolean;             // a seta para no meio com um X
};

export type SeqNote = { lane: string; at: number; text: string; tone?: "ok" | "warn" | "bad" | "info" };
export type SeqBracket = { fromAt: number; toAt: number; label: string }; // "1 RTT", "≈ 120 ms"

export type SequenceStage = {
  mode: "sequence";
  lanes: SeqLane[];
  messages: SeqMessage[];
  notes?: SeqNote[];
  brackets?: SeqBracket[];
  /** Estado por lane, exibido sob o cabeçalho (ex.: "ESTABLISHED", "SYN_SENT"). */
  laneState?: Record<string, { text: string; tone?: "ok" | "warn" | "bad" | "info" }>;
};

// ---------- modo camadas ----------

export type LayerFile = { name: string; tone?: "ok" | "warn" | "bad" | "info"; whiteout?: boolean };

export type Layer = {
  id: string;                 // estável entre passos
  label: string;              // "TCP", "app.jar", "camada gravável"
  sub?: string;               // "porta 52814 -> 443", "12 MB"
  tone?: Tone;
  status?: Status;
  readonly?: boolean;         // desenha cadeado pequeno
  files?: LayerFile[];        // chips de arquivo dentro da faixa (OverlayFS)
};

export type LayerStack = {
  id: string;
  label: string;              // "Remetente", "Imagem loja/app:1.0", "Container web"
  orientation: "nested" | "bands";
  /** nested: envelopes; o primeiro é o mais externo. bands: faixas empilhadas; a primeira fica em cima. */
  layers: Layer[];
  /** Só em bands: a visão unificada que o processo enxerga, com a camada de origem de cada arquivo. */
  merged?: { label: string; files: { name: string; from: string }[] };
};

export type LayersStage = {
  mode: "layers";
  stacks: LayerStack[];       // 1 a 3, lado a lado (empilhados no celular)
  wires?: { from: string; to: string; label?: string; kind?: FlowKind }[]; // pacote animado entre pilhas
};

export type Stage = IsoStage | SequenceStage | LayersStage;

// ---------- passo e cena ----------

export type TerminalStep = {
  /** Comandos sugeridos (chips clicáveis). Cada um precisa produzir saída (o checador garante). */
  suggest: string[];
  /** Saídas declaradas. A chave é o comando normalizado (seção 6.1). */
  outputs?: Record<string, string>;
};

export type SceneStep = {
  kind: StepKind;
  nav: string;                // rótulo curto da trilha de passos, até 18 caracteres
  title: string;
  body: string[];             // 1 a 3 parágrafos, até 420 caracteres cada; aceita **negrito** e `código`
  callout?: Callout;
  metrics?: Metric[];         // até 4
  cmd?: string;               // comando em destaque, copiável
  terminal?: TerminalStep;
  changes?: string[];         // substitui o "O que mudou" automático
  stage: Stage;
  extra?: Panel[];            // painéis do visualizador de algoritmos abaixo do palco (gráfico de cwnd, tabela CIDR)
};

export type SceneDef = {
  title: string;
  summary: string;            // 1 frase
  shell?: "kubectl" | "docker" | "bash";  // ativa o terminal; ausente = sem terminal
  goals: { text: string; step: number }[]; // 2 a 4 objetivos; step é 1-based: marcado ao chegar nele
  steps: SceneStep[];         // 6 a 14 passos
};
```

`IconName` é um union exportado de `iso.ts` com os ícones da seção 3.5.

## 3. Renderizador isométrico (`iso-stage.tsx`)

### 3.1 Projeção e geometria (`lib/scenes/iso.ts`)

- Unidade de grade: `TW = 56` px de largura, `TH = 28` px de altura no losango.
- `project(x, y, z) = [(x - y) * TW / 2, (x + y) * TH / 2 - z]`.
- Zona: losango do topo em `z + th` e as duas faces laterais (esquerda e direita) descendo até `z`.
- Box: cubo com base quadrada de aresta `size` centrada em (x, y); três faces visíveis (topo, esquerda,
  direita) com a mesma cor em três luminosidades; ícone desenhado no centro do topo, em projeção plana
  (sem distorção), 14 px; pílula do label 10 px abaixo da face frontal.
- Users: de 1 a 9 bonequinhos (círculo + corpo arredondado) em grade 3×3 sobre uma zona pequena; label abaixo.
- Âncora de um elemento (para links e fluxos): centro do topo do cubo; centro do losango do topo da zona;
  centro do grupo de users.
- `bounds(stage)` devolve o retângulo de todos os elementos projetados, incluindo labels e badges.
- Funções puras e testáveis com `tsx` (o checador usa `bounds` para recusar coordenadas não finitas).

### 3.2 Ordem de desenho

1. Zonas, ordenadas por `x + y` da base (de trás para frente).
2. Links.
3. Boxes e users, ordenados por `(x + y)` absoluto e depois por `z`.
4. Fluxos (partículas) por cima de tudo.
5. Labels de links e de fluxos.

### 3.3 Animação entre passos

- Cada elemento é um `<g>` com `key={id}` e `transform: translate(px, py)` via `style`, com
  `transition: transform 600ms cubic-bezier(.2,.8,.2,1), opacity 400ms`. Assim, mover a mesma id anima.
- **Entrada:** elemento cuja id não existia no passo anterior recebe a classe `scene-enter` (de opacity 0 e
  scale .85 a 1, 450 ms, com `transform-origin` no centro).
- **Saída:** o player mantém por 400 ms os elementos que sumiram, com a classe `scene-exit` (fade para 0),
  e depois os remove.
- **Status:** `new` faz um anel verde pulsar 2 vezes; `bad` aplica borda e brilho rose e um pequeno X no
  canto; `dead` deixa o elemento em escala de cinza com 45% de opacidade; `warn` borda âmbar; `muted` 40% de
  opacidade; `hi` anel arcane fixo.
- **Câmera:** o `viewBox` é `bounds` + 48 px de margem. Interpole o viewBox entre passos com
  `requestAnimationFrame` em 500 ms (viewBox não transiciona via CSS). Proporção do palco fixa em 16:10 no
  desktop e 4:3 abaixo de 640 px; o viewBox é ajustado (letterbox) para caber sem distorcer.
- **Fluxos** (`flows.tsx`): calcule o caminho (polilinha entre as âncoras de `from`, `via` e `to`) e anime
  `rate` partículas igualmente defasadas com `<animateMotion>` sobre um `<path>` invisível, a 140 px/s.
  Cores: `req` arcane-300, `heavy` âmbar (partícula maior), `bad` rose (partícula some a 85% do caminho
  com um X), `hc` emerald (partícula pequena, caminho tracejado), `data` cyan.
- Botão "repetir" reinicia as animações de entrada e de fluxo do passo atual (troque uma `key` de época).
- Botão "pausar" congela os fluxos (`svg.pauseAnimations()`) e as transições.

### 3.4 Cores

Use a paleta escura da plataforma (`tailwind.config.ts` e `COLOR` em `components/visualizer/panels.tsx`).
Cada `Tone` tem 3 luminosidades para as faces do cubo (topo mais claro, esquerda média, direita escura) e
uma cor de borda. Zonas usam a mesma tonalidade, mais escura e com baixa saturação, para o conteúdo se
destacar. A plataforma é dark-only; não crie tema claro.

### 3.5 Ícones

Use componentes do `lucide-react` (já é dependência). `IconName` mínimo:
`server, database, globe, user, users, layers, box, container, cpu, hard-drive, network, router, shield,
lock, key, file, file-text, folder, clock, gauge, terminal, cloud, refresh, git-branch, list, zap, mail,
search, scale, ship, cog, eye, alert, check, x`. Mapeie cada nome para um componente em um único objeto
em `iso.ts`. Dentro do SVG, renderize o ícone do lucide como `<svg>` aninhado com x/y/width/height.

### 3.6 Acessibilidade

O `<svg>` do palco tem `role="img"` e `aria-label` com o título do passo seguido dos labels dos
elementos com status `bad`, `new` ou `dead`. O texto do passo fica num container com `aria-live="polite"`.

## 4. Renderizadores de sequência e de camadas

### 4.1 Sequência (`sequence-stage.tsx`)

- Lanes em colunas de largura igual (mínimo 110 px; abaixo disso, rolagem horizontal **dentro** do palco,
  nunca da página). Cabeçalho com ícone e label; abaixo, `laneState` como pílula; linha vertical tracejada.
- Linha `at` em `y = header + 24 + at * 38`. Seta de `from` a `to` descendo `span` linhas (seta inclinada).
  `from === to`: laço curto à direita da lane. Label acima da seta, `detail` em mono 10 px abaixo.
- Mensagens cujo `id` já existia no passo anterior aparecem estáticas. As novas são desenhadas em sequência,
  na ordem de `at`, com 350 ms de defasagem: o traço é desenhado (`stroke-dashoffset`) e uma partícula
  percorre a seta. `lost`: o traço para em 55% e aparece um X rose.
- `notes`: caixinha à direita da lane, alinhada à linha. `brackets`: colchete vertical à esquerda do diagrama
  com o label centralizado ("1 RTT").
- Altura automática pela maior `at + span`, limitada a `min(62vh, 520px)` com rolagem interna; o cabeçalho
  das lanes fica fixo (`sticky`) e a rolagem acompanha a última mensagem nova nos dois eixos.
- Linha de 32 px: uma mensagem com `detail` exige **2 linhas** entre o fim dela (`at + span`) e o início da
  próxima que cruze a mesma faixa de lanes (o checador acusa).

### 4.2 Camadas (`layers-stage.tsx`)

- HTML + CSS (não SVG), com `layout` animado por transições de `max-height`/`opacity` e `key` por layer.
- `nested`: cada layer é uma caixa que envolve a próxima (envelope), com o label da camada na borda
  esquerda e `sub` em mono. Layer nova entra crescendo de fora para dentro; layer removida encolhe e some.
- `bands`: faixas empilhadas, a primeira em cima. `readonly` mostra um cadeado. `files` vira uma fileira de
  chips; `whiteout` mostra o chip riscado com o prefixo `.wh.`. `merged` aparece no topo como faixa "visão do
  container", com cada chip na cor da camada de origem e um pequeno indicador de qual camada veio.
- `wires`: uma linha entre duas pilhas com um envelope animado indo de uma à outra (CSS keyframes).
- Até 3 pilhas lado a lado; abaixo de 640 px, empilhadas.

## 5. "O que mudou" automático (`lib/scenes/diff.ts`)

`computeChanges(prev: SceneStep | null, next: SceneStep): string[]`, função pura. No primeiro passo, devolve
`[]`. Se `next.changes` existir, devolve ele. Senão, gera no máximo 4 itens, nesta prioridade:

1. Métricas com `value` diferente: `"Erros 0% → 4%"`.
2. Entidades novas (iso): `"+ <label>"`; removidas: `"− <label>"`.
3. Status alterado (iso e camadas): `"<label>: <status em PT>"` (ok "saudável", new "novo", warn "atenção",
   bad "com falha", dead "fora do ar", muted "inativo", hi "em destaque").
4. Fluxos `bad` que surgiram: `"Requisições falhando"`; que sumiram: `"Falhas cessaram"`.
5. Sequência: mensagens novas, `"+ <label>"`. Camadas: layers novas `"+ <label>"` e removidas `"− <label>"`.

Se o modo do palco mudou entre os passos, devolva `[]` (o texto do passo explica a troca).

## 6. Terminal simulado

### 6.1 Resolução (`lib/scenes/terminal.ts`)

`resolveCommand(input: string, step: SceneStep, def: SceneDef): { output: string; known: boolean }`

1. Normalize: trim, colapsar espaços, remover `$ ` inicial.
2. `help` → lista os comandos sugeridos do passo e os comandos derivados disponíveis.
3. `clear` → o componente limpa o histórico (resolver devolve `output: ""`).
4. Correspondência exata em `step.terminal.outputs`.
5. Comandos derivados (6.2), se o palco for iso e houver `res` nas entidades.
6. Caso contrário: `known: false` e a mensagem
   `# Este terminal é simulado e não conhece "<cmd>". Digite help para ver o que dá para rodar aqui.`

### 6.2 Comandos derivados da cena

Gerados das entidades com `res`, em tabela com colunas alinhadas como a CLI real:

| Shell | Comando | Fonte |
|---|---|---|
| kubectl | `kubectl get pods` / `-o wide` / `-n <ns>` / `-A` | `res.kind === "pod"` (NAME, READY, STATUS, RESTARTS, AGE; wide acrescenta IP e NODE) |
| kubectl | `kubectl get nodes` | `res.kind === "node"` |
| kubectl | `kubectl get svc` | `res.kind === "service"` (NAME, TYPE, CLUSTER-IP, PORT(S), AGE) |
| kubectl | `kubectl get deploy` | `res.kind === "deployment"` |
| docker | `docker ps` / `docker ps -a` | `res.kind === "container"` (`-a` inclui os que não estão "Up") |
| docker | `docker images` | `res.kind === "image"` |
| docker | `docker network ls`, `docker volume ls` | `network` e `volume` |

Saídas declaradas em `outputs` têm prioridade sobre as derivadas.

### 6.3 Componente (`scene-terminal.tsx`)

- Aparece abaixo do texto do passo quando `def.shell` existe; recolhível, aberto por padrão no desktop e
  fechado no celular.
- Faixa de aviso fixa: "Terminal simulado para estudo: as respostas vêm do diagrama deste passo, não de um
  cluster real. Nomes, IPs e tempos podem diferir do que você verá."
- Chips "Experimente:" com `suggest`; clicar roda o comando.
- O histórico persiste entre passos, com um separador `— Passo N · <nav> —` a cada troca de passo.
- Input mono com prompt `$`; Enter roda; ↑/↓ navegam o histórico de comandos; botão "limpar".
- Saída com `white-space: pre` e rolagem horizontal própria; altura máxima de 280 px com rolagem.

## 7. Registro (`lib/scenes/registry.ts`)

Mesmo padrão de `lib/visualizers/registry.ts`:

```ts
const LOADERS: Record<string, () => Promise<SceneDef>> = {
  "cloud-devops/services-ingress-dns": () => import("./kubernetes/services").then((m) => m.serviceEIngress),
  // ...
};
export function hasScene(track: string, lesson: string): boolean;
export async function loadScene(track: string, lesson: string): Promise<SceneDef | null>;
export const SCENE_KEYS = Object.keys(LOADERS);
```

Cada cena é um `export const nome: SceneDef = {...}` montado com os builders do `kit`. Prefira funções
auxiliares por arquivo (como `scenes.js` do site de referência faz com `srv3`, `nd3`) para não repetir o
cenário base em todo passo.

## 8. Player (`scene-player.tsx`) e página da aula

### 8.1 Layout

Dentro da coluna do artigo, logo abaixo do header da aula e **acima** do visualizador de algoritmos (se a
aula tiver os dois):

```text
┌ Cena · <título da cena> ─────────────────────────── [↻] [❚❚] [⤢] ┐
│ [métrica] [métrica] [métrica]                                    │
│                                                                  │
│                         PALCO (16:10)                            │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ PASSO 4 / 11                                    [CONCEITO]       │
│ Título do passo                                                  │
│ Parágrafos...                                                    │
│ ┌ Ideia-chave ─────────────┐   O QUE MUDOU                       │
│ │ ...                      │   + Readiness probe falhando        │
│ └──────────────────────────┘   ~ Erros 0% → 4%                   │
│ $ kubectl get endpoints api  [copiar]                            │
│ [← Voltar]                         [Próximo: Divide →]           │
├──────────────────────────────────────────────────────────────────┤
│ ①─②─③─④─⑤─⑥─⑦─⑧─⑨─⑩─⑪   (trilha de passos com nav labels)          │
├──────────────────────────────────────────────────────────────────┤
│ Terminal (simulado) ...                                          │
├──────────────────────────────────────────────────────────────────┤
│ Você vai aprender: ☑ ... ☐ ...                                   │
└──────────────────────────────────────────────────────────────────┘
```

- As métricas ficam numa faixa acima do palco; os controles (repetir, pausar, tela cheia) ficam sempre no
  cabeçalho do player, nunca sobre o palco. No iso, `SceneStep.focus` define o enquadramento em telas
  estreitas (botão "ver tudo / aproximar"); e o checador recusa textos sobrepostos (`isoLayout`).
- Tela cheia (`⤢`): overlay `fixed inset-0` com palco à esquerda e o texto do passo numa coluna de 360 px à
  direita (abaixo de 1024 px, texto embaixo). `Esc` fecha. Use a Fullscreen API se disponível, com o
  overlay como fallback.
- Trilha de passos: círculos numerados ligados por linha; concluídos preenchidos; o atual com anel;
  `nav` abaixo de cada círculo (escondido abaixo de 640 px, só números). Clicar vai ao passo.
- Chip de tipo com cor: contexto zinc, problema rose, solução emerald, conceito arcane, trade-off âmbar,
  resumo cyan. Callouts: chave (arcane, "Ideia-chave"), atenção (rose, "Atenção"), bom-saber (emerald,
  "Bom saber"), cada um com ícone.
- Botão "Próximo" mostra o `nav` do passo seguinte. No último passo, vira "Ir para o texto da aula" e rola
  até o markdown.

### 8.2 Interação

- Teclado: `←`/`→` trocam de passo, `R` repete, `Espaço` pausa. Só quando o foco **não** estiver em
  input, textarea, select, `[contenteditable]` ou `.cm-editor`, **e** o player estiver ao menos 40% visível
  (IntersectionObserver). `Espaço` só é capturado com o foco dentro do player, para não sequestrar a rolagem.
- URL: `?cena=N` (1-based) abre no passo N. Ao trocar de passo, atualize com `history.replaceState` (sem
  navegação do Next). Não use `?passo`, que é do visualizador.
- Progresso local: `localStorage["cena:<trilha>/<aula>"] = maior passo alcançado`, dentro de try/catch.
  Objetivos com `step <= maior alcançado` aparecem marcados. Não grave nada no banco.
- `prefers-reduced-motion: reduce`: sem transições nem partículas. Fluxos viram setas estáticas com ponta,
  na cor do tipo; mensagens de sequência aparecem prontas.

### 8.3 Integração

- `components/scenes/lesson-scene.tsx`: mesmo padrão de `LessonVisualizer` (import dinâmico com 2
  tentativas, skeleton `animate-pulse` com a altura aproximada do player).
- `app/trilhas/[slug]/aulas/[lesson]/page.tsx`: renderize
  `{hasScene(track.slug, lesson.slug) && <LessonScene track={track.slug} lesson={lesson.slug} />}` antes da
  linha do visualizador.
- `app/trilhas/[slug]/aulas/[lesson]/loading.tsx`: não precisa mudar.
- Celular (390 px): sem rolagem horizontal da página; palco 4:3; métricas em 2 colunas acima do palco;
  controles menores.

## 9. Checador (`scripts/check-scenes.ts`)

Para cada chave do registro, carregue a cena e acuse **erro** (exit 1) quando:

- A cena não carrega, tem menos de 6 ou mais de 14 passos, ou 0 ou mais de 4 objetivos.
- `goals[].step` está fora de 1..N.
- O primeiro passo não é `contexto` nem `problema`, ou o último não é `resumo`.
- Passo sem `title`, com `nav` vazio ou com mais de 18 caracteres, `body` vazio, com mais de 3 parágrafos ou
  parágrafo acima de 420 caracteres, ou mais de 4 métricas.
- Iso: id duplicado no passo; `parent` que não existe ou não é zona; `from`/`to`/`via` de link ou fluxo que
  não existe; `bounds` não finito; box com mais de 2 badges; `meter` fora de 0..100.
- Sequência: lane duplicada; mensagem com lane inexistente; id de mensagem duplicado; `at` negativo; nota
  em lane inexistente.
- Camadas: id de pilha ou de layer duplicado; `merged.files[].from` que não é layer da pilha; wire com pilha
  inexistente.
- Terminal: `def.shell` existe, mas um comando de `suggest` devolve `known: false` no `resolveCommand`.
- Duas cenas registradas para a mesma chave, ou chave cuja trilha/aula não existe em `content/tracks`.
- **Cobertura:** toda aula das trilhas em `REQUIRED_TRACKS` tem cena. Comece com `[]` na Fase 0 e
  acrescente a trilha ao concluir cada fase (`redes-backend`, depois `docker`, depois `kubernetes`).

Imprima um resumo: `✅ N cenas, M passos` ou a lista de erros.

## 10. Seed: poda de módulos e aulas órfãs (Fase 0)

Hoje o seed só poda trilhas, problemas e projetos. Ao remover módulos de `cloud-devops`, as aulas ficariam
órfãs no banco. Em `prisma/seed.ts`:

- Por trilha processada, guarde os ids de módulo, aula e exercício gerados. Ao fim da trilha, apague
  `module` da trilha cujo id não está no conjunto (cascade leva aulas, exercícios e progresso), depois
  `lesson` e `exercise` da trilha que não estão no conjunto.
- Apague `ReviewItem` com `kind` igual a `"lesson"` ou `"exercise"` cujo `refId` não existe mais.
- Some isso ao log `🧹 Poda:` existente, com contagem por tipo.
- Teste: rode `npm run seed` duas vezes seguidas; a segunda não pode podar nada.

## 11. Critérios de aceite da Fase 0

- [ ] Os três modos funcionam com as 3 cenas do piloto (`piloto.md`), em desktop, tela cheia e 390 px.
- [ ] Transições: mover, entrar, sair, mudar status, câmera e fluxos, todos visíveis na cena de Service.
- [ ] "O que mudou" automático correto em todos os passos do piloto.
- [ ] Terminal: sugestões, saídas declaradas, comandos derivados (`kubectl get pods -o wide`,
      `docker ps`), `help`, `clear`, comando desconhecido, histórico ↑/↓ e separador de passo.
- [ ] `?cena=N`, teclado com as restrições da 8.2, progresso local e objetivos marcados.
- [ ] `prefers-reduced-motion` testado (DevTools > Rendering > Emulate).
- [ ] Aulas sem cena e o visualizador de algoritmos continuam iguais (abra uma aula de `estruturas-dados`).
- [ ] `typecheck`, `validate:content`, `check-scenes`, `check-visualizers` e `seed` (duas vezes) verdes.
- [ ] Sem erros nem avisos de React no console do navegador nas aulas com cena.
- [ ] Commit + push, e relatório com prints dos 3 pilotos (desktop e celular) salvos no scratchpad.
