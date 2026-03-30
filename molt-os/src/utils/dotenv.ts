import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export interface LoadDotEnvOptions {
  quiet?: boolean;
  override?: boolean;
}

export function loadDotEnv(options: LoadDotEnvOptions = {}): void {
  const { quiet = false, override = false } = options;

  const envPaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env.development"),
    path.resolve(process.cwd(), ".env.production"),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const parsed = dotenv.parse(fs.readFileSync(envPath, "utf-8"));

        for (const [key, value] of Object.entries(parsed)) {
          if (override || !(key in process.env)) {
            process.env[key] = value;
          }
        }

        if (!quiet) {
          console.log(`Loaded environment from: ${envPath}`);
        }
      } catch (error) {
        console.error(`Failed to load environment from ${envPath}:`, error);
      }
    }
  }
}

export function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

export function setEnv(key: string, value: string): void {
  process.env[key] = value;
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

export function getEnvBoolean(key: string, defaultValue?: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === null) {
    return defaultValue ?? false;
  }
  return value.toLowerCase() === "true" || value === "1";
}

export function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined || value === null) {
    return defaultValue ?? 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? (defaultValue ?? 0) : parsed;
}
