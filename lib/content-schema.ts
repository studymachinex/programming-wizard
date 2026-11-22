import { z } from "zod";

export const quizQuestionSchema = z.object({
  question: z.string().min(5),
  options: z.array(z.string().min(1)).min(2).max(6),
  answer: z.number().int().min(0),
  explanation: z.string().min(5),
});

export const lessonMetaSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug deve ser kebab-case"),
  title: z.string().min(4),
  summary: z.string().min(20),
  minutes: z.number().int().min(5).max(180),
  file: z.string().min(3),
  takeaways: z.array(z.string().min(8)).min(2).max(6),
  quiz: z.array(quizQuestionSchema).min(2).max(5).optional(),
});

export const moduleSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug do módulo deve ser kebab-case"),
  title: z.string().min(3),
  description: z.string().min(20),
  estimatedHours: z.number().int().min(1).max(40).default(4),
  lessons: z.array(lessonMetaSchema).min(1),
  exercises: z.array(z.string()).default([]),
});

export const trackSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug da trilha deve ser kebab-case"),
  title: z.string().min(3),
  subtitle: z.string().min(10),
  description: z.string().min(40),
  level: z.enum(["fundamento", "intermediario", "avancado", "especialista"]),
  icon: z.string().default("sparkles"),
  accent: z.string().default("arcane"),
  estimatedHours: z.number().int().min(1).max(200),
  isCore: z.boolean().default(false),
  outcomes: z.array(z.string().min(10)).min(3).max(10),
  modules: z.array(moduleSchema).min(2),
});

export const exerciseSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug do exercício deve ser kebab-case"),
  title: z.string().min(4),
  difficulty: z.enum(["facil", "medio", "dificil", "especialista"]),
  tags: z.array(z.string()).min(1).max(8),
  estimatedMinutes: z.number().int().min(5).max(480),
  statement: z.string().min(80),
  starterCode: z.string().min(10),
  solutionCode: z.string().min(10),
  tests: z.string().min(10),
  hints: z.array(z.string().min(5)).min(1).max(5),
  externalUrl: z.string().url().nullable().optional(),
});

/**
 * Atividades do fim da aula (content/tracks/<trilha>/activities/<aula>.json).
 * "code": exercício validado pelos testes no runner da plataforma.
 * "reflection": algo que o aluno faz sozinho (explicar, comparar) e marca como feito.
 */
const activitySlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug da atividade deve ser kebab-case");

export const codeActivitySchema = z.object({
  slug: activitySlug,
  kind: z.literal("code"),
  title: z.string().min(6),
  statement: z.string().min(60),
  starterCode: z.string().min(10),
  solutionCode: z.string().min(10),
  tests: z.string().includes("@Test"),
  hints: z.array(z.string().min(5)).min(1).max(5),
});

export const reflectionActivitySchema = z.object({
  slug: activitySlug,
  kind: z.literal("reflection"),
  title: z.string().min(10),
});

export const activitySchema = z.discriminatedUnion("kind", [codeActivitySchema, reflectionActivitySchema]);
export const activitiesFileSchema = z.array(activitySchema).min(1);

export const problemSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(3),
  platform: z.enum(["LeetCode", "HackerRank", "Beecrowd", "Codeforces", "Outro"]),
  url: z.string().url(),
  difficulty: z.enum(["facil", "medio", "dificil"]),
  level: z.number().int().min(1).max(5),
  topic: z.string().min(3),
  moduleSlug: z.string().optional(),
  description: z.string().optional(),
});

export const problemsFileSchema = z.array(problemSchema);

export const projectSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(4),
  description: z.string().min(80),
  level: z.enum(["intermediario", "avancado", "especialista"]),
  estimatedHours: z.number().int().min(4).max(200),
  stack: z.array(z.string()).min(2),
  requirements: z.array(z.string().min(15)).min(5),
  stretchGoals: z.array(z.string().min(10)).default([]),
  trackSlug: z.string().optional(),
});

export const projectsFileSchema = z.array(projectSchema);

export type TrackManifest = z.infer<typeof trackSchema>;
export type ModuleManifest = z.infer<typeof moduleSchema>;
export type LessonMeta = z.infer<typeof lessonMetaSchema>;
export type ExerciseManifest = z.infer<typeof exerciseSchema>;
export type ProblemManifest = z.infer<typeof problemSchema>;
export type ProjectManifest = z.infer<typeof projectSchema>;
export type ActivityManifest = z.infer<typeof activitySchema>;
