/**
 * Modelo das cenas interativas: uma história de 6 a 14 passos que abre a aula.
 * Cada passo descreve o estado do diagrama; o motor anima a diferença entre um passo e o seguinte.
 * O autor escreve só dados (sem React), então as cenas são testáveis com `tsx`.
 */
import type { Panel } from "@/lib/visualizers/types";
import type { IconName } from "./iso";

export type StepKind = "contexto" | "problema" | "solucao" | "conceito" | "tradeoff" | "resumo";

/** Estado visual de um elemento. */
export type Status = "ok" | "new" | "warn" | "bad" | "dead" | "muted" | "hi";

/** Paleta de cores dos elementos (mapeada para os tokens da plataforma). */
export type Tone = "arcane" | "mana" | "rune" | "ember" | "rose" | "sky" | "zinc" | "violet";

export type Badge = { text: string; tone?: "ok" | "warn" | "bad" | "info" };

export type Metric = {
  id: string; // estável entre passos, para o diff
  label: string; // "Pods da API", "Erros", "Latência"
  value: string | number;
  tone?: "ok" | "warn" | "bad";
};

export type Callout = { kind: "chave" | "atencao" | "bom-saber"; text: string };

/** Metadados para o terminal gerar saída a partir da cena. */
export type Resource = {
  kind: "pod" | "node" | "service" | "deployment" | "container" | "image" | "volume" | "network";
  name: string;
  namespace?: string;
  status?: string; // "Running", "CrashLoopBackOff", "Up 3 minutes", ...
  ready?: string; // "1/1"
  restarts?: number;
  ip?: string;
  node?: string;
  image?: string;
  ports?: string; // "80:8080/TCP", "0.0.0.0:8080->8080/tcp"
  type?: string; // tipo do Service: ClusterIP, NodePort...
  age?: string; // "5d", "3m"
};

// ---------- modo isométrico ----------

export type IsoZone = {
  id: string;
  type: "zone";
  x: number;
  y: number; // canto de trás, em unidades de grade
  w: number;
  d: number; // largura (eixo x) e profundidade (eixo y)
  th?: number; // espessura em px (padrão 10)
  z?: number; // elevação da base em px (padrão 0)
  label?: string; // pílula no canto da frente
  tone?: Tone; // padrão "zinc"
  status?: Status;
  dashed?: boolean; // borda tracejada (namespace, rede lógica)
};

export type IsoBox = {
  id: string;
  type: "box";
  x: number;
  y: number; // centro da base, em unidades de grade
  parent?: string; // id de uma zona: x/y passam a ser relativos ao canto da zona e z ao topo dela
  z?: number;
  size?: "sm" | "md" | "lg"; // aresta da base: 1.2 / 1.6 / 2.2 unidades; altura 18 / 26 / 34 px
  icon: IconName;
  label: string;
  tone?: Tone;
  status?: Status;
  badges?: Badge[]; // até 2, empilhados acima do cubo
  meter?: number; // 0–100: barrinha de uso (CPU, memória) acima do cubo
  res?: Resource; // opcional, para o terminal
};

export type IsoUsers = {
  id: string;
  type: "users";
  x: number;
  y: number;
  count: number; // 1–9 bonequinhos
  label?: string;
  status?: Status;
};

export type IsoEntity = IsoZone | IsoBox | IsoUsers;

export type IsoLink = {
  from: string;
  to: string; // ids de box/users/zone
  style?: "solid" | "dashed";
  tone?: Tone;
  label?: string;
};

export type FlowKind = "req" | "heavy" | "bad" | "hc" | "data";

export type IsoFlow = {
  from: string;
  to: string;
  via?: string[]; // ids intermediários (ex.: usuário -> ingress -> service -> pod)
  rate: 1 | 2 | 3 | 4; // partículas simultâneas no caminho
  kind?: FlowKind; // padrão "req"
  label?: string; // aparece no meio do caminho (ex.: "probe falhou")
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
  id: string; // estável entre passos: mensagens já vistas aparecem estáticas
  from: string;
  to: string; // ids de lane (from === to é permitido: processamento local, desenha laço)
  at: number; // linha (0, 1, 2...)
  span?: number; // linhas que a seta "desce" (latência visível); padrão 0 = horizontal
  label: string; // "SYN seq=100"
  detail?: string; // linha pequena em mono abaixo ("MSS=1460, janela=64240")
  tone?: "ok" | "bad" | "data" | "ctrl"; // padrão "ctrl"
  lost?: boolean; // a seta para no meio com um X
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
  id: string; // estável entre passos (único dentro da pilha)
  label: string; // "TCP", "app.jar", "camada gravável"
  sub?: string; // "porta 52814 -> 443", "12 MB"
  tone?: Tone;
  status?: Status;
  readonly?: boolean; // desenha cadeado pequeno
  files?: LayerFile[]; // chips de arquivo dentro da faixa (OverlayFS)
};

export type LayerStack = {
  id: string;
  label: string; // "Remetente", "Imagem loja/app:1.0", "Container web"
  orientation: "nested" | "bands";
  /** nested: envelopes; o primeiro é o mais externo. bands: faixas empilhadas; a primeira fica em cima. */
  layers: Layer[];
  /** Só em bands: a visão unificada que o processo enxerga, com a camada de origem de cada arquivo. */
  merged?: { label: string; files: { name: string; from: string }[] };
};

export type LayersStage = {
  mode: "layers";
  stacks: LayerStack[]; // 1 a 3, lado a lado (empilhados no celular)
  wires?: { from: string; to: string; label?: string; kind?: FlowKind }[]; // pacote animado entre pilhas
};

export type Stage = IsoStage | SequenceStage | LayersStage;

// ---------- passo e cena ----------

export type TerminalStep = {
  /** Comandos sugeridos (chips clicáveis). Cada um precisa produzir saída (o checador garante). */
  suggest: string[];
  /** Saídas declaradas. A chave é o comando normalizado (trim, espaços colapsados, sem "$ "). */
  outputs?: Record<string, string>;
};

export type SceneStep = {
  kind: StepKind;
  nav: string; // rótulo curto da trilha de passos, até 18 caracteres
  title: string;
  body: string[]; // 1 a 3 parágrafos, até 420 caracteres cada; aceita **negrito** e `código`
  callout?: Callout;
  metrics?: Metric[]; // até 4
  cmd?: string; // comando em destaque, copiável
  terminal?: TerminalStep;
  changes?: string[]; // substitui o "O que mudou" automático
  /** Só modo iso: ids enquadrados no celular quando o diagrama inteiro ficaria pequeno. Padrão: status bad/new/hi + pontas de fluxos bad. */
  focus?: string[];
  stage: Stage;
  extra?: Panel[]; // painéis do visualizador de algoritmos abaixo do palco
};

export type SceneDef = {
  title: string;
  summary: string; // 1 frase
  shell?: "kubectl" | "docker" | "bash"; // ativa o terminal; ausente = sem terminal
  goals: { text: string; step: number }[]; // 2 a 4 objetivos; step é 1-based
  steps: SceneStep[]; // 6 a 14 passos
};
