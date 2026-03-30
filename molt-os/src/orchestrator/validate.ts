import * as fs from "fs";
import * as path from "path";
import { ValidationResult, OrchestratorTask } from "./types";

export interface ValidationRule {
  name: string;
  validate: (task: OrchestratorTask, outputPath: string) => Promise<ValidationResult>;
}

export const outputFileExists: ValidationRule = {
  name: "output_file_exists",
  async validate(task: OrchestratorTask, outputPath: string): Promise<ValidationResult> {
    const exists = fs.existsSync(outputPath);
    return {
      passed: exists,
      check: "output_file_exists",
      message: exists ? "Output file exists" : "Output file not found",
      details: { outputPath },
    };
  },
};

export const outputNotEmpty: ValidationRule = {
  name: "output_not_empty",
  async validate(task: OrchestratorTask, outputPath: string): Promise<ValidationResult> {
    if (!fs.existsSync(outputPath)) {
      return {
        passed: false,
        check: "output_not_empty",
        message: "Output file not found",
        details: { outputPath },
      };
    }

    const stats = fs.statSync(outputPath);
    const content = fs.readFileSync(outputPath, "utf-8");
    const isNotEmpty = stats.size > 0 && content.trim().length > 0;

    return {
      passed: isNotEmpty,
      check: "output_not_empty",
      message: isNotEmpty ? "Output file has content" : "Output file is empty",
      details: { size: stats.size, contentLength: content.length },
    };
  },
};

export const validJsonFormat: ValidationRule = {
  name: "valid_json_format",
  async validate(task: OrchestratorTask, outputPath: string): Promise<ValidationResult> {
    if (!fs.existsSync(outputPath)) {
      return {
        passed: false,
        check: "valid_json_format",
        message: "Output file not found",
      };
    }

    try {
      const content = fs.readFileSync(outputPath, "utf-8");
      JSON.parse(content);
      return {
        passed: true,
        check: "valid_json_format",
        message: "Output is valid JSON",
      };
    } catch (error) {
      return {
        passed: false,
        check: "valid_json_format",
        message: "Output is not valid JSON",
        details: { error: (error as Error).message },
      };
    }
  },
};

export const taskSpecificValidation: ValidationRule = {
  name: "task_specific_validation",
  async validate(task: OrchestratorTask, outputPath: string): Promise<ValidationResult> {
    if (!fs.existsSync(outputPath)) {
      return {
        passed: false,
        check: "task_specific_validation",
        message: "Output file not found",
      };
    }

    const content = fs.readFileSync(outputPath, "utf-8");
    const hasTaskReference = content
      .toLowerCase()
      .includes(task.description.toLowerCase().slice(0, 20));

    return {
      passed: hasTaskReference,
      check: "task_specific_validation",
      message: hasTaskReference ? "Output addresses task" : "Output may not address task",
      details: { taskDescription: task.description.slice(0, 50) },
    };
  },
};

export class Validator {
  private rules: ValidationRule[] = [
    outputFileExists,
    outputNotEmpty,
    validJsonFormat,
    taskSpecificValidation,
  ];

  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleName: string): void {
    this.rules = this.rules.filter((r) => r.name !== ruleName);
  }

  async validate(task: OrchestratorTask, outputPath: string): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const rule of this.rules) {
      try {
        const result = await rule.validate(task, outputPath);
        results.push(result);
      } catch (error) {
        results.push({
          passed: false,
          check: rule.name,
          message: `Validation error: ${(error as Error).message}`,
        });
      }
    }

    return results;
  }

  async validateWithCustomRules(
    task: OrchestratorTask,
    outputPath: string,
    customRules: ValidationRule[],
  ): Promise<ValidationResult[]> {
    const allRules = [...this.rules, ...customRules];
    const results: ValidationResult[] = [];

    for (const rule of allRules) {
      try {
        const result = await rule.validate(task, outputPath);
        results.push(result);
      } catch (error) {
        results.push({
          passed: false,
          check: rule.name,
          message: `Validation error: ${(error as Error).message}`,
        });
      }
    }

    return results;
  }

  getValidationSummary(results: ValidationResult[]): {
    passed: number;
    failed: number;
    allPassed: boolean;
  } {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return {
      passed,
      failed,
      allPassed: failed === 0,
    };
  }
}

export const validator = new Validator();
