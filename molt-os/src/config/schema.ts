import { z } from "zod";

export const ModelProviderSchema = z.enum(["kimi", "openai", "gemini"]);

export const PrimaryModelSchema = z.object({
  provider: z.literal("kimi"),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export const FallbackModelSchema = z
  .object({
    provider: z.enum(["openai", "gemini"]),
    apiKey: z.string().min(1),
    model: z.string().min(1),
  })
  .optional();

export const PathsSchema = z.object({
  moltDir: z.string().min(1),
  skillsDir: z.string().min(1),
  dataDir: z.string().min(1),
  workDir: z.string().min(1),
});

export const ContextSchema = z.object({
  globalFile: z.string().min(1),
  maxContextTokens: z.number().int().positive().default(128000),
  enableHotReload: z.boolean().default(true),
});

export const WorkerSchema = z.object({
  timeoutMinutes: z.number().int().positive().default(30),
  maxRetries: z.number().int().nonnegative().default(3),
  enableParallel: z.boolean().default(true),
});

export const UiSchema = z.object({
  port: z.number().int().positive().default(3000),
  devMode: z.boolean().default(false),
});

export const MoltConfigSchema = z.object({
  models: z.object({
    primary: PrimaryModelSchema,
    fallback: FallbackModelSchema,
  }),
  paths: PathsSchema,
  context: ContextSchema,
  worker: WorkerSchema,
  ui: UiSchema,
});

export type MoltConfig = z.infer<typeof MoltConfigSchema>;
export type ModelProvider = z.infer<typeof ModelProviderSchema>;
export type PrimaryModel = z.infer<typeof PrimaryModelSchema>;
export type FallbackModel = z.infer<typeof FallbackModelSchema>;
export type Paths = z.infer<typeof PathsSchema>;
export type Context = z.infer<typeof ContextSchema>;
export type Worker = z.infer<typeof WorkerSchema>;
export type Ui = z.infer<typeof UiSchema>;
