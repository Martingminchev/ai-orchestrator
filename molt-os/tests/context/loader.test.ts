import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  parseFrontmatter,
  loadSkillContext,
  loadLocationContext,
  findMoltFiles,
  loadAllSkillContexts,
  findGlobalMoltFile,
  loadContextFile,
} from "../../src/context/loader";

const testDir = path.join(__dirname, "test-fixtures");

beforeAll(() => {
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, ".molt", "skills"), { recursive: true });
  fs.mkdirSync(path.join(testDir, "subdir"), { recursive: true });

  fs.writeFileSync(
    path.join(testDir, ".molt", "skills", "test-skill.md"),
    `---
name: test-skill
description: A test skill
tags: test, example
---

# Test Skill Content

This is test content for the skill.
`,
  );

  fs.writeFileSync(
    path.join(testDir, ".molt.md"),
    `---
name: local-context
description: Local project context
---

# Local Context

This is the local project context.
`,
  );

  fs.writeFileSync(
    path.join(testDir, "subdir", ".molt.md"),
    `---
name: subdir-context
description: Subdirectory context
---

# Subdirectory Context

This is nested context.
`,
  );

  fs.writeFileSync(
    path.join(testDir, "no-frontmatter.md"),
    `# No Frontmatter

Just content without frontmatter.
`,
  );
});

afterAll(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("parseFrontmatter", () => {
  it("should parse valid frontmatter", () => {
    const content = `---
name: test-name
description: test-description
tags: tag1, tag2
---

# Content`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter.name).toBe("test-name");
    expect(result.frontmatter.description).toBe("test-description");
    expect(result.frontmatter.tags).toEqual(["tag1", "tag2"]);
    expect(result.body).toBe("# Content");
  });

  it("should handle missing frontmatter", () => {
    const content = `# Just Content`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter.name).toBe("unknown");
    expect(result.body).toBe("# Just Content");
  });

  it("should handle partial frontmatter", () => {
    const content = `---
name: partial
---

# Content Body`;

    const result = parseFrontmatter(content);

    expect(result.frontmatter.name).toBe("partial");
    expect(result.frontmatter.description).toBe("");
    expect(result.body).toBe("# Content Body");
  });
});

describe("loadSkillContext", () => {
  it("should load valid skill context", () => {
    const skillPath = path.join(testDir, ".molt", "skills", "test-skill.md");
    const result = loadSkillContext(skillPath);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("test-skill");
    expect(result!.description).toBe("A test skill");
    expect(result!.frontmatter.tags).toEqual(["test", "example"]);
    expect(result!.content).toContain("Test Skill Content");
  });

  it("should return null for non-existent file", () => {
    const result = loadSkillContext(path.join(testDir, "nonexistent.md"));

    expect(result).toBeNull();
  });
});

describe("loadLocationContext", () => {
  it("should load location context", () => {
    const contextPath = path.join(testDir, ".molt.md");
    const result = loadLocationContext(contextPath);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.name).toBe("local-context");
    expect(result!.priority).toBe(0);
  });

  it("should return null for non-existent file", () => {
    const result = loadLocationContext(path.join(testDir, "nonexistent.md"));

    expect(result).toBeNull();
  });
});

describe("findMoltFiles", () => {
  it("should find all .molt.md files recursively", () => {
    const files = findMoltFiles(testDir);

    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files.some((f) => f.includes("subdir"))).toBe(true);
  });

  it("should return empty array for non-existent directory", () => {
    const files = findMoltFiles(path.join(testDir, "nonexistent"));

    expect(files).toEqual([]);
  });
});

describe("loadAllSkillContexts", () => {
  it("should load all skill contexts from skills directory", () => {
    const skillsDir = path.join(testDir, ".molt", "skills");
    const skills = loadAllSkillContexts(skillsDir);

    expect(skills.size).toBeGreaterThanOrEqual(1);
    expect(skills.has("test-skill")).toBe(true);
  });

  it("should return empty map for non-existent directory", () => {
    const skills = loadAllSkillContexts(path.join(testDir, "nonexistent"));

    expect(skills.size).toBe(0);
  });
});

describe("findGlobalMoltFile", () => {
  it("should find global.molt.md by walking up directory tree", () => {
    const globalPath = path.join(testDir, ".molt", "global.md");
    fs.writeFileSync(
      globalPath,
      `---
name: global
description: Global context
---

# Global`,
    );

    const result = findGlobalMoltFile(testDir);

    expect(result).toBe(globalPath);
  });

  it("should return null if no global file exists", () => {
    const tempBase = path.join(process.env.TEMP || "/tmp", "molt-test-" + Date.now());
    fs.mkdirSync(tempBase, { recursive: true });
    try {
      const result = findGlobalMoltFile(tempBase);
      expect(result).toBeNull();
    } finally {
      fs.rmSync(tempBase, { recursive: true });
    }
  });
});

describe("loadContextFile", () => {
  it("should load and parse context file", () => {
    const filePath = path.join(testDir, ".molt.md");
    const result = loadContextFile(filePath);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.name).toBe("local-context");
    expect(result!.content).toContain("Local Context");
  });

  it("should return null for non-existent file", () => {
    const result = loadContextFile(path.join(testDir, "nonexistent.md"));

    expect(result).toBeNull();
  });
});
