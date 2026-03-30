import * as chokidar from "chokidar";
import * as path from "path";
import { loadContextFile, loadSkillContext, loadLocationContext } from "./loader";
import { HotReloadCallback, ContextWatcher, SkillContext, LocationContext } from "./types";

const MOLT_GLOBAL_DIR = ".molt";
const MOLT_FILE = ".molt.md";

interface WatcherManager {
  watchers: Map<string, chokidar.FSWatcher>;
  callbacks: Map<string, HotReloadCallback>;
  contextCache: Map<string, { content: string; timestamp: number }>;
}

function createWatcherManager(): WatcherManager {
  return {
    watchers: new Map(),
    callbacks: new Map(),
    contextCache: new Map(),
  };
}

export function watchContextFiles(cwd: string, callback: HotReloadCallback): ContextWatcher {
  const manager = createWatcherManager();
  const patterns = [
    path.join(cwd, "**", MOLT_FILE),
    path.join(cwd, MOLT_GLOBAL_DIR, "**", "*.md"),
    path.join(cwd, "..", MOLT_GLOBAL_DIR, "global.md"),
  ];

  const watcher = chokidar.watch(patterns, {
    cwd,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher.on("change", (filePath) => {
    const fullPath = path.join(cwd, filePath);
    const context = loadContextFile(fullPath);

    if (context) {
      const cacheKey = fullPath;
      manager.contextCache.set(cacheKey, {
        content: context.content,
        timestamp: Date.now(),
      });

      callback(filePath, context.content);
    }
  });

  watcher.on("add", (filePath) => {
    const fullPath = path.join(cwd, filePath);
    const context = loadContextFile(fullPath);

    if (context) {
      manager.contextCache.set(fullPath, {
        content: context.content,
        timestamp: Date.now(),
      });

      callback(filePath, context.content);
    }
  });

  watcher.on("unlink", (filePath) => {
    const fullPath = path.join(cwd, filePath);
    manager.contextCache.delete(fullPath);
    callback(filePath, "");
  });

  manager.watchers.set(cwd, watcher);
  manager.callbacks.set(cwd, callback);

  return {
    close: () => {
      watcher.close();
      manager.watchers.delete(cwd);
      manager.callbacks.delete(cwd);
      manager.contextCache.clear();
    },
  };
}

export function watchSkillFiles(
  skillsDir: string,
  callback: (skillName: string, context: SkillContext | null) => void,
): ContextWatcher {
  const manager = createWatcherManager();

  const watcher = chokidar.watch(path.join(skillsDir, "*.md"), {
    ignoreInitial: true,
  });

  watcher.on("change", (filePath) => {
    const skillName = path.basename(filePath, ".md");
    const skill = loadSkillContext(filePath);

    manager.contextCache.set(skillName, {
      content: skill?.content || "",
      timestamp: Date.now(),
    });

    callback(skillName, skill);
  });

  watcher.on("add", (filePath) => {
    const skillName = path.basename(filePath, ".md");
    const skill = loadSkillContext(filePath);

    if (skill) {
      manager.contextCache.set(skillName, {
        content: skill.content,
        timestamp: Date.now(),
      });

      callback(skillName, skill);
    }
  });

  watcher.on("unlink", (filePath) => {
    const skillName = path.basename(filePath, ".md");
    manager.contextCache.delete(skillName);
    callback(skillName, null);
  });

  manager.watchers.set(skillsDir, watcher);

  return {
    close: () => {
      watcher.close();
      manager.watchers.delete(skillsDir);
      manager.contextCache.clear();
    },
  };
}

export function watchLocationContext(
  cwd: string,
  callback: (filePath: string, context: LocationContext | null) => void,
): ContextWatcher {
  const manager = createWatcherManager();

  const watcher = chokidar.watch(path.join(cwd, "**", MOLT_FILE), {
    cwd,
    ignoreInitial: true,
  });

  watcher.on("change", (filePath) => {
    const fullPath = path.join(cwd, filePath);
    const context = loadLocationContext(fullPath);

    manager.contextCache.set(fullPath, {
      content: context?.content || "",
      timestamp: Date.now(),
    });

    callback(fullPath, context);
  });

  watcher.on("add", (filePath) => {
    const fullPath = path.join(cwd, filePath);
    const context = loadLocationContext(fullPath);

    if (context) {
      manager.contextCache.set(fullPath, {
        content: context.content,
        timestamp: Date.now(),
      });

      callback(fullPath, context);
    }
  });

  watcher.on("unlink", (filePath) => {
    const fullPath = path.join(cwd, filePath);
    manager.contextCache.delete(fullPath);
    callback(fullPath, null);
  });

  manager.watchers.set(cwd, watcher);

  return {
    close: () => {
      watcher.close();
      manager.watchers.delete(cwd);
      manager.contextCache.clear();
    },
  };
}

export function createDebouncedWatcher(
  cwd: string,
  callback: HotReloadCallback,
  debounceMs: number = 200,
): ContextWatcher {
  let timeoutId: NodeJS.Timeout | null = null;
  const pendingChanges = new Map<string, string>();

  const debouncedCallback: HotReloadCallback = (filePath, context) => {
    pendingChanges.set(filePath, context);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      pendingChanges.forEach((context, filePath) => {
        callback(filePath, context);
      });
      pendingChanges.clear();
    }, debounceMs);
  };

  const watcher = watchContextFiles(cwd, debouncedCallback);

  return {
    close: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      watcher.close();
    },
  };
}
