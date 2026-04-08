/**
 * runtime/registry.ts — Runtime registration and resolution.
 *
 * Keeps a Map of available runtimes. resolveRuntime() picks the best one
 * based on user settings and availability.
 */

import type { AgentRuntime } from './types';
import { getSetting } from '../db';

const runtimes = new Map<string, AgentRuntime>();

export function registerRuntime(runtime: AgentRuntime): void {
  runtimes.set(runtime.id, runtime);
}

export function getRuntime(id: string): AgentRuntime | undefined {
  return runtimes.get(id);
}

export function getAllRuntimes(): AgentRuntime[] {
  return Array.from(runtimes.values());
}

export function getAvailableRuntimes(): AgentRuntime[] {
  return getAllRuntimes().filter(r => r.isAvailable());
}

/**
 * Pick the runtime to use for a given request.
 *
 * Priority:
 * 0. cli_enabled=false → ALWAYS use native (highest-priority constraint)
 * 1. Explicit override (from function arg or per-session setting)
 * 2. Global user setting (agent_runtime)
 * 3. Auto: native if available, else claude-code-sdk
 */
export function resolveRuntime(overrideId?: string): AgentRuntime {
  // 0. cli_enabled=false is an absolute constraint — never return SDK
  const cliDisabled = getSetting('cli_enabled') === 'false';

  if (cliDisabled) {
    const native = getRuntime('native');
    if (native) return native;
    throw new Error('Native runtime not registered but CLI is disabled. This is a bug.');
  }

  // 1. Explicit override
  if (overrideId && overrideId !== 'auto') {
    const r = getRuntime(overrideId);
    if (r?.isAvailable()) return r;
  }

  // 2. Global setting
  const settingId = getSetting('agent_runtime');
  if (settingId && settingId !== 'auto') {
    const r = getRuntime(settingId);
    if (r?.isAvailable()) return r;
  }

  // 3. Auto: prefer SDK when available (full CLI capabilities), fallback to native
  const sdk = getRuntime('claude-code-sdk');
  if (sdk?.isAvailable()) return sdk;

  const native = getRuntime('native');
  if (native?.isAvailable()) return native;

  // Last resort: return native even if "unavailable" — it only needs an API key,
  // and will produce a clear error message if credentials are missing.
  if (native) return native;

  throw new Error('No agent runtime registered. This is a bug — please report it.');
}

/**
 * Predict whether the native runtime will be used for a given request.
 *
 * This mirrors resolveRuntime() logic WITHOUT actually instantiating the runtime,
 * so callers (chat route, bridge) can prepare the right MCP config upfront.
 *
 * @param providerId - The provider for this request ('openai-oauth' forces native)
 */
export function predictNativeRuntime(providerId?: string): boolean {
  // Non-Anthropic providers always force native
  if (providerId === 'openai-oauth') return true;

  // cli_enabled=false → always native
  if (getSetting('cli_enabled') === 'false') return true;

  // Explicit setting
  const settingId = getSetting('agent_runtime');
  if (settingId === 'native') return true;
  if (settingId === 'claude-code-sdk') return false;

  // Auto: prefer SDK if available, else native
  const sdk = getRuntime('claude-code-sdk');
  if (sdk?.isAvailable()) return false;

  return true; // SDK not available → native
}
