import { select, confirm, input, intro, outro } from "@clack/prompts";
import { getLogger } from "../utils/logger.js";

export async function promptUserForConfig(): Promise<void> {
  const logger = getLogger();
  intro("Welcome to MOLT-OS Configuration");

  const apiKey = await input({
    message: "Enter your Kimi API Key:",
    placeholder: "sk-...",
    validate: (value) => {
      if (value.length < 10) {
        return "API key seems too short";
      }
    },
  });

  const model = await select({
    message: "Select Kimi model:",
    options: [
      { value: "k2.5", label: "Kimi k2.5 (Recommended)" },
      { value: "k2.5-thinking", label: "Kimi k2.5-thinking" },
      { value: "moonshot-v1-8k", label: "Moonshot v1 8k" },
      { value: "moonshot-v1-32k", label: "Moonshot v1 32k" },
      { value: "moonshot-v1-128k", label: "Moonshot v1 128k" },
    ],
  });

  const enableParallel = await confirm({
    message: "Enable parallel processing?",
    initialValue: true,
  });

  outro(`Configuration complete!
  API Key: ${apiKey?.toString().slice(0, 10)}...
  Model: ${model}
  Parallel: ${enableParallel}`);
}

export async function promptForAction(): Promise<string> {
  const action = await select({
    message: "What would you like to do?",
    options: [
      { value: "run", label: "Run Agent" },
      { value: "config", label: "Configure Settings" },
      { value: "status", label: "Check Status" },
      { value: "exit", label: "Exit" },
    ],
  });
  return action as string;
}
