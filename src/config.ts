// Token + base-url store. Plain JSON at $XDG_CONFIG_HOME/juzpost/config.json
// (defaults to ~/.config/juzpost). ponytail: fs + JSON, not a config library.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';

export type Config = { baseUrl?: string; token?: string };

const DEFAULT_BASE = 'https://www.juzpost.com';

function dir(): string {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'juzpost');
}
export function configPath(): string {
  return join(dir(), 'config.json');
}

export function loadConfig(): Config {
  const p = configPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Config;
  } catch {
    return {}; // ponytail: corrupt file = treat as empty, login rewrites it
  }
}

export function saveConfig(patch: Config): Config {
  const next = { ...loadConfig(), ...patch };
  mkdirSync(dir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  return next;
}

export function clearToken(): void {
  const cfg = loadConfig();
  delete cfg.token;
  mkdirSync(dir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}

/** Resolution order: --base flag (via env we set) > config file > prod default. */
export function baseUrl(): string {
  return process.env.JUZPOST_URL || loadConfig().baseUrl || DEFAULT_BASE;
}
