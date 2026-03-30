import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DaemonConfig {
  name: string;
  scriptPath: string;
  workingDir: string;
  logPath: string;
  pidPath: string;
  interval: number;
}

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
  lastRun?: number;
  error?: string;
}

const defaultConfig: DaemonConfig = {
  name: 'molt-os-daemon',
  scriptPath: path.join(__dirname, 'daemon-main.js'),
  workingDir: path.dirname(__dirname),
  logPath: path.join(path.dirname(__dirname), 'logs', 'daemon.log'),
  pidPath: path.join(path.dirname(__dirname), 'pids', 'daemon.pid'),
  interval: 60000
};

let daemonProcess: ReturnType<typeof spawn> | null = null;

export function getDaemonConfig(): DaemonConfig {
  return { ...defaultConfig };
}

export function isDaemonRunning(pidPath: string): boolean {
  try {
    if (!fs.existsSync(pidPath)) {
      return false;
    }
    const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim());
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export function getDaemonPid(pidPath: string): number | null {
  try {
    if (!fs.existsSync(pidPath)) {
      return null;
    }
    return parseInt(fs.readFileSync(pidPath, 'utf-8').trim()) || null;
  } catch {
    return null;
  }
}

export function startDaemon(config: DaemonConfig = getDaemonConfig()): void {
  const logger = getLogger();
  
  if (isDaemonRunning(config.pidPath)) {
    logger.warn('Daemon is already running');
    return;
  }

  const logDir = path.dirname(config.logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  daemonProcess = spawn('node', [config.scriptPath], {
    cwd: config.workingDir,
    stdio: ['ignore', fs.openSync(config.logPath, 'a'), fs.openSync(config.logPath, 'a']),
    detached: true,
    env: { ...process.env, DAEMON_MODE: 'true' }
  });

  fs.writeFileSync(config.pidPath, String(daemonProcess.pid));

  daemonProcess.unref();

  logger.info('Daemon started', { pid: daemonProcess.pid });
}

export function stopDaemon(config: DaemonConfig = getDaemonConfig()): void {
  const logger = getLogger();
  
  const pid = getDaemonPid(config.pidPath);
  if (!pid) {
    logger.warn('Daemon is not running');
    return;
  }

  try {
    process.kill(pid);
    fs.unlinkSync(config.pidPath);
    logger.info('Daemon stopped', { pid });
  } catch (error) {
    logger.error('Failed to stop daemon', { error });
  }
}

export function getDaemonStatus(config: DaemonConfig = getDaemonConfig()): DaemonStatus {
  const pid = getDaemonPid(config.pidPath);
  
  if (!pid) {
    return { running: false };
  }

  try {
    process.kill(pid, 0);
    const pidPath = config.pidPath;
    const stats = fs.existsSync(pidPath) ? fs.statSync(pidPath) : null;
    return {
      running: true,
      pid,
      uptime: stats ? Date.now() - stats.mtimeMs : undefined
    };
  } catch {
    return { running: false };
  }
}

export async function startDaemonProcess(): Promise<void> {
  const logger = getLogger();
  
  logger.info('Starting daemon process...');
  
  process.on('SIGTERM', () => {
    logger.info('Daemon received SIGTERM, shutting down...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('Daemon received SIGINT, shutting down...');
    process.exit(0);
  });

  logger.info('Daemon process started', { pid: process.pid });
}

export function installDaemonService(): void {
  const logger = getLogger();
  const config = getDaemonConfig();
  
  logger.info('Installing daemon service...', { config });
  
  const scheduleCommand = `schtasks /Create /TN "MOLT-OS Daemon" /SC ONSTART /DELAY 0005 /TR "\"${process.execPath}\" \"${config.scriptPath}\" daemon" /RL HIGHEST /F`;
  
  logger.info('To install as Windows service, run schtasks with appropriate parameters');
}
