import { z } from "zod";

export const ReadCodeSchema = z.object({
  path: z.string().min(1),
  language: z.string().optional(),
});

export type ReadCodeInput = z.infer<typeof ReadCodeSchema>;

export const EditCodeSchema = z.object({
  path: z.string().min(1),
  oldCode: z.string(),
  newCode: z.string(),
});

export type EditCodeInput = z.infer<typeof EditCodeSchema>;

export const RefactorCodeSchema = z.object({
  path: z.string().min(1),
  type: z.enum(["extract-function", "rename", "move", "inline", "simplify", "optimize"]),
  target: z.string().optional(),
});

export type RefactorCodeInput = z.infer<typeof RefactorCodeSchema>;

export const FindPatternsSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  recursive: z.boolean().default(true),
});

export type FindPatternsInput = z.infer<typeof FindPatternsSchema>;

export const AnalyzeCodeSchema = z.object({
  path: z.string().min(1),
  rules: z.array(z.string()).optional(),
});

export type AnalyzeCodeInput = z.infer<typeof AnalyzeCodeSchema>;

export const GenerateCodeSchema = z.object({
  specification: z.string().min(1),
  language: z.string().optional(),
  template: z.string().optional(),
});

export type GenerateCodeInput = z.infer<typeof GenerateCodeSchema>;

export const RunTestsSchema = z.object({
  pattern: z.string().optional(),
  verbose: z.boolean().default(false),
});

export type RunTestsInput = z.infer<typeof RunTestsSchema>;

export const LintCodeSchema = z.object({
  path: z.string().min(1),
  fix: z.boolean().default(false),
});

export type LintCodeInput = z.infer<typeof LintCodeSchema>;

export type CodeToolInput =
  | ReadCodeInput
  | EditCodeInput
  | RefactorCodeInput
  | FindPatternsInput
  | AnalyzeCodeInput
  | GenerateCodeInput
  | RunTestsInput
  | LintCodeInput;

export interface CodeToolResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}
