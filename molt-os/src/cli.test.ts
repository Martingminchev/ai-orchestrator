import { describe, it, expect } from "vitest";
import { buildProgram } from "./cli";

describe("CLI Commands", () => {
  describe("buildProgram", () => {
    it("should create a CLI program", () => {
      const program = buildProgram();
      expect(program).toBeDefined();
      expect(program.name()).toBe("molt-os");
    });

    it("should have version command", () => {
      const program = buildProgram();
      const version = program.commands.find((c) => c.name() === "version");
      expect(version).toBeDefined();
    });

    it("should have help command", () => {
      const program = buildProgram();
      const help = program.commands.find((c) => c.name() === "help");
      expect(help).toBeDefined();
    });
  });
});
