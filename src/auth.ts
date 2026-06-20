// Auth flows: device-code login, logout, whoami. Logic lives here (not in the command
// wiring) so it's unit-testable with a mocked fetch + injectable sleep.
import { api, ApiError } from './api.js';
import { saveConfig, clearToken, loadConfig } from './config.js';

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export type LoginOpts = {
  deviceName?: string;
  sleep?: Sleep;
  onPrompt?: (verifyUrl: string) => void;
  maxWaitSec?: number;
};

/**
 * Device-code login: start → print verify URL → poll auth/token until approved.
 * Polls handle `428 pending` (keep waiting) and `410 gone` (expired). Stores the token.
 */
export async function login(opts: LoginOpts = {}): Promise<{ token: string }> {
  const sleep = opts.sleep ?? realSleep;
  const start = await api<{ deviceCode: string; verifyUrl: string; interval?: number; expiresIn?: number }>(
    '/api/cli/v1/auth/start',
    { method: 'POST', auth: false, body: { deviceName: opts.deviceName } },
  );
  opts.onPrompt?.(start.verifyUrl);

  const interval = start.interval ?? 3;
  const maxWait = opts.maxWaitSec ?? start.expiresIn ?? 600;
  let waited = 0;
  while (waited < maxWait) {
    await sleep(interval * 1000);
    waited += interval;
    try {
      const r = await api<{ token: string }>('/api/cli/v1/auth/token', {
        method: 'POST',
        auth: false,
        body: { deviceCode: start.deviceCode },
      });
      if (r.token) {
        saveConfig({ token: r.token });
        return { token: r.token };
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 428) continue; // pending approval
      if (e instanceof ApiError && e.status === 410) throw new Error('Login code expired. Run `juzpost auth login` again.');
      throw e;
    }
  }
  throw new Error('Login timed out waiting for browser approval.');
}

/** Clear the local token; with `revoke`, also hard-delete the server-side row first. */
export async function logout(opts: { revoke?: boolean } = {}): Promise<void> {
  if (opts.revoke && loadConfig().token) {
    try {
      await api('/api/cli/v1/auth/token', { method: 'DELETE' });
    } catch {
      // best-effort: a revoked/expired token still gets cleared locally below
    }
  }
  clearToken();
}

/** Identity behind the stored token, or null if logged out. */
export function whoami(): Promise<unknown> | null {
  if (!loadConfig().token) return null;
  return api('/api/cli/v1/me');
}
