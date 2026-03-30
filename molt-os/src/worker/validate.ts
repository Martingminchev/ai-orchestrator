import * as fs from "fs";
import * as path from "path";
import { SubagentResult, ValidationResult } from "./types";

export interface SubagentValidationRule {
  name: string;
  validate: (result: SubagentResult) => Promise<ValidationResult>;
}

export const outputFileCreated: SubagentValidationRule = {
  name: "output_file_created",
  async validate(result: SubagentResult): Promise<ValidationResult> {
    if (!result.outputPath) {
      return {
        passed: false,
        check: "output_file_created",
        message: "No output path provided",
      };
    }

    const exists = fs.existsSync(result.outputPath);
    return {
      passed: exists,
      check: "output_file_created",
      message: exists ? "Output file created" : "Output file not found",
      details: { outputPath: result.outputPath },
    };
  },
};

export const noErrorFlag: SubagentValidationRule = {
  name: "no_error_flag",
  async validate(result: SubagentResult): Promise<ValidationResult> {
    const hasError = !!result.error;
    return {
      passed: !hasError,
      check: "no_error_flag",
      message: hasError ? `Error occurred: ${result.error}` : "No errors reported",
      details: { error: result.error },
    };
  },
};

export const validationChecksPassed: SubagentValidationRule = {
  name: "validation_checks_passed",
  async validate(result: SubagentResult): Promise<ValidationResult> {
    if (!result.validationResults || result.validationResults.length === 0) {
      return {
        passed: true,
        check: "validation_checks_passed",
        message: "No validation results to check",
      };
    }

    const allPassed = result.validationResults.every((r) => r.passed);
    const failedChecks = result.validationResults.filter((r) => !r.passed);

    return {
      passed: allPassed,
      check: "validation_checks_passed",
      message: allPassed
        ? "All validation checks passed"
        : `${failedChecks.length} validation check(s) failed`,
      details: { failedChecks: failedChecks.map((c) => c.check) },
    };
  },
};

export class SubagentValidator {
  private rules: SubagentValidationRule[] = [
    outputFileCreated,
    noErrorFlag,
    validationChecksPassed,
  ];

  addRule(rule: SubagentValidationRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleName: string): void {
    this.rules = this.rules.filter((r) => r.name !== ruleName);
  }

  async validate(result: SubagentResult): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const rule of this.rules) {
      try {
        const ruleResult = await rule.validate(result);
        results.push(ruleResult);
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

  async validateMultiple(results: SubagentResult[]): Promise<Map<string, ValidationResult[]>> {
    const allResults = new Map<string, ValidationResult[]>();

    for (const result of results) {
      const validationResults = await this.validate(result);
      allResults.set(result.subagentId, validationResults);
    }

    return allResults;
  }

  getSummary(results: Map<string, ValidationResult[]>): {
    totalSubagents: number;
    allPassed: string[];
    someFailed: string[];
  } {
    const allPassed: string[] = [];
    const someFailed: string[] = [];

    for (const [subagentId, validationResults] of results) {
      const passed = validationResults.every((r) => r.passed);
      if (passed) {
        allPassed.push(subagentId);
      } else {
        someFailed.push(subagentId);
      }
    }

    return {
      totalSubagents: results.size,
      allPassed,
      someFailed,
    };
  }
}

export const subagentValidator = new SubagentValidator();

export function aggregateWorkerResults(results: SubagentResult[]): {
  success: boolean;
  completedSubagents: number;
  failedSubagents: number;
  allResults: SubagentResult[];
} {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  return {
    success: failed.length === 0,
    completedSubagents: successful.length,
    failedSubagents: failed.length,
    allResults: results,
  };
}
