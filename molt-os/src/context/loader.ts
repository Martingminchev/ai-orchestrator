import * as fs from "fs";
import * as path from "path";
import { ContextFrontmatter, SkillContext, LocationContext } from "./types";

const MOLT_GLOBAL_DIR = ".molt";
const MOLT_FILE = ".molt.md";
const SKILLS_DIR = "skills";

export function parseFrontmatter(content: string): {
  frontmatter: ContextFrontmatter;
  body: string;
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    return {
      frontmatter: { name: "unknown", description: "No frontmatter found" },
      body: content,
    };
  }

  const frontmatterRaw = frontmatterMatch[1];
  const body = content.replace(frontmatterMatch[0], "").trim();

  const frontmatter: ContextFrontmatter = {
    name: "unknown",
    description: "",
  };

  frontmatterRaw.split("\n").forEach((line) => {
    const colonIndex = line.indexOf(":");
    if (colonIndex > -1) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      switch (key) {
        case "name":
          frontmatter.name = value;
          break;
        case "description":
          frontmatter.description = value;
          break;
        case "version":
          frontmatter.version = value;
          break;
        case "tags":
          frontmatter.tags = value.split(",").map((t) => t.trim());
          break;
      }
    }
  });

  return { frontmatter, body };
}

function readFileIfExists(filePath: string): { content: string; exists: boolean } {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return { content, exists: true };
  } catch {
    return { content: "", exists: false };
  }
}

export function loadSkillContext(filePath: string): SkillContext | null {
  const { content, exists } = readFileIfExists(filePath);

  if (!exists) {
    return null;
  }

  const { frontmatter, body } = parseFrontmatter(content);

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    content: body,
    frontmatter,
    filePath,
    version: frontmatter.version,
  };
}

export function loadLocationContext(filePath: string): LocationContext | null {
  const { content, exists } = readFileIfExists(filePath);

  if (!exists) {
    return null;
  }

  const { frontmatter, body } = parseFrontmatter(content);

  return {
    filePath,
    frontmatter,
    content: body,
    priority: 0,
  };
}

export function findMoltFiles(startPath: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
          walk(fullPath);
        } else if (entry.name === MOLT_FILE) {
          files.push(fullPath);
        }
      }
    } catch {}
  }

  walk(startPath);
  return files.sort();
}

export function loadAllSkillContexts(skillsDir: string): Map<string, SkillContext> {
  const skills = new Map<string, SkillContext>();

  try {
    const files = fs.readdirSync(skillsDir);

    for (const file of files) {
      if (file.endsWith(".md")) {
        const filePath = path.join(skillsDir, file);
        const skill = loadSkillContext(filePath);

        if (skill) {
          skills.set(skill.name, skill);
        }
      }
    }
  } catch {}

  return skills;
}

export function findGlobalMoltFile(startPath: string): string | null {
  let current = startPath;
  const root = path.parse(current).root;

  while (current !== root) {
    const globalPath = path.join(current, MOLT_GLOBAL_DIR, "global.md");
    const { exists } = readFileIfExists(globalPath);

    if (exists) {
      return globalPath;
    }

    current = path.dirname(current);
  }

  return null;
}

export function loadContextFile(
  filePath: string,
): { frontmatter: ContextFrontmatter; content: string } | null {
  const { content, exists } = readFileIfExists(filePath);

  if (!exists) {
    return null;
  }

  const { frontmatter, body } = parseFrontmatter(content);

  return { frontmatter, content: body };
}
