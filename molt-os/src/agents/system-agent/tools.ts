import { z } from "zod";

export const RunCommandSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(300000).default(60000),
});

export type RunCommandInput = z.infer<typeof RunCommandSchema>;

export const ExecuteScriptSchema = z.object({
  path: z.string().min(1),
  interpreter: z.enum(["bash", "python", "node", "powershell"]).optional(),
  args: z.array(z.string()).optional(),
});

export type ExecuteScriptInput = z.infer<typeof ExecuteScriptSchema>;

export const CheckStatusSchema = z.object({
  target: z.enum(["system", "service", "process"]),
  name: z.string().optional(),
});

export type CheckStatusInput = z.infer<typeof CheckStatusSchema>;

export const MonitorResourcesSchema = z.object({
  metrics: z.array(z.enum(["cpu", "memory", "disk", "network"])).default(["cpu", "memory"]),
  duration: z.number().min(1000).max(600000).default(10000),
  interval: z.number().min(100).max(60000).default(1000),
});

export type MonitorResourcesInput = z.infer<typeof MonitorResourcesSchema>;

export const AutomateTasksSchema = z.object({
  tasks: z.array(
    z.object({
      name: z.string().min(1),
      command: z.string().min(1),
      schedule: z.string().optional(),
    }),
  ),
});

export type AutomateTasksInput = z.infer<typeof AutomateTasksSchema>;

export const ScheduleJobsSchema = z.object({
  command: z.string().min(1),
  schedule: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

export type ScheduleJobsInput = z.infer<typeof ScheduleJobsSchema>;

export type SystemToolInput =
  | RunCommandInput
  | ExecuteScriptSchema
  | CheckStatusSchema
  | MonitorResourcesSchema
  | AutomateTasksSchema
  | ScheduleJobsSchema;

export interface SystemToolResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}
