import * as path from "path";
import { getContextForAgent, mergeContextLayers, buildHierarchicalContext } from "./hierarchy";
import { ContextInjectionOptions, SkillContext, HierarchicalContext } from "./types";

const contextCache = new Map<string, { content: string; timestamp: number }>();
const CACHE_TTL = 60000;

export function injectContext(
  prompt: string,
  cwd: string,
  agentType: string,
  options: ContextInjectionOptions = {},
): string {
  const {
    skillName,
    includeGlobal = true,
    includeLocation = true,
    includeSkills = true,
    includeRag = false,
  } = options;

  const context = getContextForAgent(cwd, agentType, {
    includeGlobal,
    includeLocation,
    includeSkills,
    includeRag,
  });

  if (!context) {
    return prompt;
  }

  return `${context}\n\n---\n\n# Current Task\n\n${prompt}`;
}

export function injectContextWithoutFileWrite(
  prompt: string,
  cwd: string,
  agentType: string,
): string {
  const hierarchical = buildHierarchicalContext(cwd);
  const context = mergeContextLayers(hierarchical, agentType);

  if (!context) {
    return prompt;
  }

  return `${context}\n\n---\n\n# Task\n\n${prompt}`;
}

export function getInMemoryContext(cwd: string, agentType: string): string {
  const cacheKey = `${cwd}:${agentType}`;
  const cached = contextCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.content;
  }

  const hierarchical = buildHierarchicalContext(cwd);
  const context = mergeContextLayers(hierarchical, agentType);

  contextCache.set(cacheKey, {
    content: context,
    timestamp: Date.now(),
  });

  return context;
}

export function clearContextCache(key?: string): void {
  if (key) {
    contextCache.delete(key);
  } else {
    contextCache.clear();
  }
}

export function buildPromptWithContext(
  basePrompt: string,
  contextLayers: {
    global?: string;
    location?: string;
    skill?: string;
    rag?: string[];
  },
): string {
  const parts: string[] = [];

  if (contextLayers.global) {
    parts.push(contextLayers.global);
  }

  if (contextLayers.location) {
    parts.push(contextLayers.location);
  }

  if (contextLayers.skill) {
    parts.push(contextLayers.skill);
  }

  if (contextLayers.rag && contextLayers.rag.length > 0) {
    parts.push(contextLayers.rag.join("\n\n"));
  }

  parts.push(`# Task\n\n${basePrompt}`);

  return parts.join("\n\n---\n\n");
}

export function getSkillContextDirect(skillName: string, cwd: string): string | null {
  const skillsDir = path.join(cwd, ".molt", "skills");
  const skillFile = path.join(skillsDir, `${skillName}.md`);

  try {
    const content = require("fs").readFileSync(skillFile, "utf-8");
    return content;
  } catch {
    return null;
  }
}

export function preloadContextCache(cwd: string, agentTypes: string[]): void {
  for (const agentType of agentTypes) {
    getInMemoryContext(cwd, agentType);
  }
}
