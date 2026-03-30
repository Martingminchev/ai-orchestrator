export interface ContextFrontmatter {
  name: string;
  description: string;
  version?: string;
  tags?: string[];
}

export interface SkillContext {
  name: string;
  description: string;
  content: string;
  frontmatter: ContextFrontmatter;
  filePath: string;
}

export interface LocationContext {
  filePath: string;
  frontmatter: ContextFrontmatter;
  content: string;
  priority: number;
}

export interface HierarchicalContext {
  global: SkillContext | null;
  locations: LocationContext[];
  skills: Map<string, SkillContext>;
}

export interface ContextLayer {
  global: string;
  locations: string[];
  skills: string;
  rag: string[];
}

export interface ContextInjectionOptions {
  skillName?: string;
  includeGlobal?: boolean;
  includeLocation?: boolean;
  includeSkills?: boolean;
  includeRag?: boolean;
  cwd?: string;
}

export interface HotReloadCallback {
  (filePath: string, context: string): void;
}

export interface ContextWatcher {
  close(): void;
}
