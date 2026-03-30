import { z } from "zod";

export const ReadFileSchema = z.object({
  path: z.string().min(1),
  encoding: z.enum(["utf-8", "base64", "binary"]).default("utf-8"),
});

export type ReadFileInput = z.infer<typeof ReadFileSchema>;

export const WriteFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
});

export type WriteFileInput = z.infer<typeof WriteFileSchema>;

export const MoveFileSchema = z.object({
  source: z.string().min(1),
  destination: z.string().min(1),
});

export type MoveFileInput = z.infer<typeof MoveFileSchema>;

export const DeleteFileSchema = z.object({
  path: z.string().min(1),
  force: z.boolean().default(false),
});

export type DeleteFileInput = z.infer<typeof DeleteFileSchema>;

export const ListDirectorySchema = z.object({
  path: z.string().min(1),
  recursive: z.boolean().default(false),
  filter: z.string().optional(),
});

export type ListDirectoryInput = z.infer<typeof ListDirectorySchema>;

export const SearchFilesSchema = z.object({
  pattern: z.string().min(1),
  cwd: z.string().optional(),
  recursive: z.boolean().default(true),
});

export type SearchFilesInput = z.infer<typeof SearchFilesSchema>;

export const GlobSchema = z.object({
  pattern: z.string().min(1),
  baseDir: z.string().optional(),
});

export type GlobInput = z.infer<typeof GlobSchema>;

export const CreateDirectorySchema = z.object({
  path: z.string().min(1),
  parents: z.boolean().default(true),
});

export type CreateDirectoryInput = z.infer<typeof CreateDirectorySchema>;

export const CopyFileSchema = z.object({
  source: z.string().min(1),
  destination: z.string().min(1),
});

export type CopyFileInput = z.infer<typeof CopyFileSchema>;

export type FileToolInput =
  | ReadFileInput
  | WriteFileInput
  | MoveFileInput
  | DeleteFileInput
  | ListDirectoryInput
  | SearchFilesInput
  | GlobInput
  | CreateDirectoryInput
  | CopyFileInput;

export interface FileToolResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}
