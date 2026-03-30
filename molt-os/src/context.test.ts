import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, loadSkillContext, findMoltFiles } from "./src/context/loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Context Loading", () => {
  describe("parseFrontmatter", () => {
    it("should parse valid frontmatter", () => {
      const content = `---
name: test-skill
description: A test skill
version: 1.0.0
tags: test, demo
---
This is the body content.`;

      const result = parseFrontmatter(content);

      expect(result.frontmatter.name).toBe("test-skill");
      expect(result.frontmatter.description).toBe("A test skill");
      expect(result.frontmatter.version).toBe("1.0.0");
      expect(result.frontmatter.tags).toEqual(["test", "demo"]);
      expect(result.body).toBe("This is the body content.");
    });

    it("should handle missing frontmatter", () => {
      const content = "No frontmatter here.";
      const result = parseFrontmatter(content);

      expect(result.frontmatter.name).toBe("unknown");
      expect(result.body).toBe("No frontmatter here.");
    });

    it("should handle empty content", () => {
      const result = parseFrontmatter("");
      expect(result.frontmatter.name).toBe("unknown");
      expect(result.body).toBe("");
    });
  });

  describe("loadSkillContext", () => {
    it("should load skill context from file", () => {
      const testFilePath = path.join(__dirname, "test-fixtures", "test-skill.md");

      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(
        testFilePath,
        `---
name: test-skill
description: Test description
---
Test content.`,
      );

      const result = loadSkillContext(testFilePath);

      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-skill");
      expect(result?.description).toBe("Test description");
      expect(result?.content).toBe("Test content.");

      fs.unlinkSync(testFilePath);
    });

    it("should return null for non-existent file", () => {
      const result = loadSkillContext("/non/existent/path.md");
      expect(result).toBeNull();
    });
  });

  describe("findMoltFiles", () => {
    it("should find .molt.md files recursively", () => {
      const testDir = path.join(__dirname, "test-fixtures-dir");
      fs.mkdirSync(testDir, { recursive: true });
      fs.mkdirSync(path.join(testDir, "subdir"), { recursive: true });

      fs.writeFileSync(path.join(testDir, ".molt.md"), "---");
      fs.writeFileSync(path.join(testDir, "subdir", ".molt.md"), "---");
      fs.writeFileSync(path.join(testDir, "other.md"), "---");

      const files = findMoltFiles(testDir);

      expect(files.length).toBe(2);
      expect(files.every((f) => f.endsWith(".molt.md"))).toBe(true);

      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it("should ignore node_modules and .git directories", () => {
      const testDir = path.join(__dirname, "test-fixtures-ignore");
      fs.mkdirSync(path.join(testDir, "node_modules"), { recursive: true });
      fs.mkdirSync(path.join(testDir, ".git"), { recursive: true });

      fs.writeFileSync(path.join(testDir, ".molt.md"), "---");
      fs.writeFileSync(path.join(testDir, "node_modules", ".molt.md"), "---");
      fs.writeFileSync(path.join(testDir, ".git", ".molt.md"), "---");

      const files = findMoltFiles(testDir);

      expect(files.length).toBe(1);

      fs.rmSync(testDir, { recursive: true, force: true });
    });
  });
});
