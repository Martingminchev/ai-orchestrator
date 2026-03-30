import * as path from "path";
import * as fs from "fs";
import {
  loadSkillContext,
  loadLocationContext,
  loadAllSkillContexts,
  findMoltFiles,
  findGlobalMoltFile,
  loadContextFile,
} from "./loader";
import { SkillContext, LocationContext, HierarchicalContext, ContextLayer } from "./types";

const MOLT_FILE = ".molt.md";
const MOLT_GLOBAL_DIR = ".molt";

export function buildHierarchicalContext(cwd: string): HierarchicalContext {
  const globalFile = findGlobalMoltFile(cwd);
  const global = globalFile ? loadSkillContext(globalFile) : null;

  const moltFiles = findMoltFiles(cwd);
  const locations: LocationContext[] = moltFiles
    .map((filePath, index) => {
      const context = loadLocationContext(filePath);
      if (context) {
        context.priority = moltFiles.length - index;
      }
      return context!;
    })
    .filter(Boolean);

  const skillsDir = path.join(cwd, MOLT_GLOBAL_DIR, "skills");
  const skills = loadAllSkillContexts(skillsDir);

  return {
    global,
    locations,
    skills,
  };
}

export function getLocationContextChain(cwd: string): LocationContext[] {
  const chain: LocationContext[] = [];
  let current = cwd;
  const root = path.parse(current).root;

  while (current !== root) {
    const moltPath = path.join(current, MOLT_FILE);
    const context = loadLocationContext(moltPath);

    if (context) {
      chain.push(context);
    }

    current = path.dirname(current);
  }

  chain.reverse();
  return chain;
}

export function mergeContextLayers(hierarchical: HierarchicalContext, skillName?: string): string {
  const parts: string[] = [];

  if (hierarchical.global) {
    parts.push(hierarchical.global.content);
  }

  for (const location of hierarchical.locations) {
    parts.push(location.content);
  }

  if (skillName) {
    const skill = hierarchical.skills.get(skillName);
    if (skill) {
      parts.push(skill.content);
    }
  }

  return parts.join("\n\n---\n\n");
}

export function getContextForAgent(
  cwd: string,
  agentType: string,
  options: {
    includeGlobal?: boolean;
    includeLocation?: boolean;
    includeSkills?: boolean;
    includeRag?: boolean;
  } = {},
): string {
  const {
    includeGlobal = true,
    includeLocation = true,
    includeSkills = true,
    includeRag = false,
  } = options;

  const parts: string[] = [];
  const hierarchical = buildHierarchicalContext(cwd);

  if (includeGlobal && hierarchical.global) {
    parts.push(hierarchical.global.content);
  }

  if (includeLocation) {
    for (const location of hierarchical.locations) {
      parts.push(location.content);
    }
  }

  if (includeSkills) {
    const skill = hierarchical.skills.get(agentType);
    if (skill) {
      parts.push(skill.content);
    }
  }

  if (includeRag) {
    // RAG context would be injected here from memory system
  }

  return parts.join("\n\n---\n\n");
}

export function getAllContexts(cwd: string): ContextLayer {
  const hierarchical = buildHierarchicalContext(cwd);

  return {
    global: hierarchical.global?.content || "",
    locations: hierarchical.locations.map((l) => l.content),
    skills: "",
    rag: [],
  };
}

export function resolveContextPath(cwd: string, relativePath: string): string {
  return path.resolve(cwd, relativePath);
}
