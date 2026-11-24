-- Índices de performance do Programming Wizard.
-- Idempotente: pode rodar quantas vezes quiser (docker compose up, setup, CI).
-- Os nomes seguem o padrão do Prisma para que `prisma db push` não recrie nada.
--
-- Em volume novo o schema ainda não existe quando o sidecar `indexes` roda.
-- Nesse caso o script apenas avisa e sai com sucesso, para não derrubar o
-- `docker compose up --wait`; o `npm run db:indexes` reaplica depois do push.
SELECT (to_regclass('public."Track"') IS NOT NULL) AS pw_schema_ready \gset
\if :pw_schema_ready

BEGIN;

-- Busca textual (ILIKE '%termo%') sem full scan nas tabelas de conteúdo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Catálogo / navegação
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Track_order_idx" ON "Track" ("order");

CREATE INDEX IF NOT EXISTS "Module_trackId_order_idx" ON "Module" ("trackId", "order");

CREATE INDEX IF NOT EXISTS "Lesson_slug_idx" ON "Lesson" ("slug");
CREATE INDEX IF NOT EXISTS "Lesson_trackId_order_idx" ON "Lesson" ("trackId", "order");
CREATE INDEX IF NOT EXISTS "Lesson_moduleId_order_idx" ON "Lesson" ("moduleId", "order");

CREATE INDEX IF NOT EXISTS "Exercise_trackId_order_idx" ON "Exercise" ("trackId", "order");
CREATE INDEX IF NOT EXISTS "Exercise_moduleId_order_idx" ON "Exercise" ("moduleId", "order");
CREATE INDEX IF NOT EXISTS "Exercise_difficulty_idx" ON "Exercise" ("difficulty");

CREATE INDEX IF NOT EXISTS "ExternalProblem_trackId_order_idx" ON "ExternalProblem" ("trackId", "order");
CREATE INDEX IF NOT EXISTS "ExternalProblem_platform_idx" ON "ExternalProblem" ("platform");
CREATE INDEX IF NOT EXISTS "ExternalProblem_level_order_idx" ON "ExternalProblem" ("level", "order");

CREATE INDEX IF NOT EXISTS "Project_order_idx" ON "Project" ("order");
CREATE INDEX IF NOT EXISTS "Project_trackId_idx" ON "Project" ("trackId");

CREATE INDEX IF NOT EXISTS "LessonActivity_lessonId_order_idx" ON "LessonActivity" ("lessonId", "order");

-- ---------------------------------------------------------------------------
-- Progresso do perfil (todas as consultas filtram por profileId)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "LessonProgress_profileId_status_idx" ON "LessonProgress" ("profileId", "status");
CREATE INDEX IF NOT EXISTS "LessonProgress_profileId_updatedAt_idx" ON "LessonProgress" ("profileId", "updatedAt");
CREATE INDEX IF NOT EXISTS "LessonProgress_profileId_bookmarked_updatedAt_idx" ON "LessonProgress" ("profileId", "bookmarked", "updatedAt");

CREATE INDEX IF NOT EXISTS "ExerciseProgress_profileId_status_idx" ON "ExerciseProgress" ("profileId", "status");
CREATE INDEX IF NOT EXISTS "ProblemProgress_profileId_status_idx" ON "ProblemProgress" ("profileId", "status");
CREATE INDEX IF NOT EXISTS "ProjectProgress_profileId_status_idx" ON "ProjectProgress" ("profileId", "status");
CREATE INDEX IF NOT EXISTS "ActivityProgress_profileId_status_idx" ON "ActivityProgress" ("profileId", "status");

CREATE INDEX IF NOT EXISTS "ReviewItem_profileId_dueAt_idx" ON "ReviewItem" ("profileId", "dueAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_profileId_createdAt_idx" ON "ActivityLog" ("profileId", "createdAt");

-- ---------------------------------------------------------------------------
-- Busca (Command Palette e /api/search)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Track_title_trgm_idx" ON "Track" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Track_subtitle_trgm_idx" ON "Track" USING gin ("subtitle" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Track_description_trgm_idx" ON "Track" USING gin ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Lesson_title_trgm_idx" ON "Lesson" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Lesson_summary_trgm_idx" ON "Lesson" USING gin ("summary" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Lesson_content_trgm_idx" ON "Lesson" USING gin ("content" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Exercise_title_trgm_idx" ON "Exercise" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Exercise_statement_trgm_idx" ON "Exercise" USING gin ("statement" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ExternalProblem_title_trgm_idx" ON "ExternalProblem" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ExternalProblem_topic_trgm_idx" ON "ExternalProblem" USING gin ("topic" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Project_title_trgm_idx" ON "Project" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Project_description_trgm_idx" ON "Project" USING gin ("description" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Limpeza de índices antigos substituídos pelos compostos acima.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "Module_trackId_idx";
DROP INDEX IF EXISTS "Lesson_trackId_idx";
DROP INDEX IF EXISTS "Lesson_moduleId_idx";
DROP INDEX IF EXISTS "Exercise_trackId_idx";
DROP INDEX IF EXISTS "Exercise_moduleId_idx";
DROP INDEX IF EXISTS "ExternalProblem_trackId_idx";
DROP INDEX IF EXISTS "ExternalProblem_level_idx";
DROP INDEX IF EXISTS "LessonProgress_status_idx";
DROP INDEX IF EXISTS "LessonProgress_profileId_bookmarked_idx";
DROP INDEX IF EXISTS "ExerciseProgress_status_idx";
DROP INDEX IF EXISTS "ProblemProgress_status_idx";
DROP INDEX IF EXISTS "ReviewItem_dueAt_idx";
DROP INDEX IF EXISTS "ActivityLog_createdAt_idx";
DROP INDEX IF EXISTS "LessonActivity_lessonId_idx";

COMMIT;

-- Estatísticas novas para o planner usar os índices imediatamente.
ANALYZE;

\else
\echo 'Schema ainda não aplicado; índices serão criados após `npm run db:push`.'
\endif
