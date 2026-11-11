import "server-only";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Settings that each person enters themselves (Last.fm key, Spotify Client ID).
// Stored in ~/Library/Application Support/Spotifind/config.env — never inside the app bundle,
// so a copy of Spotifind you share with friends carries none of your keys.

export const SUPPORT_DIR = process.env.SPOTIFIND_SUPPORT_DIR || join(homedir(), "Library", "Application Support", "Spotifind");
export const CONFIG_FILE = join(SUPPORT_DIR, "config.env");

export function readConfigFile(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(CONFIG_FILE, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && m[2]) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Environment first (dev .env.local / the app passes config.env through), then the settings file, then the
 * defaults built into a copy someone shared with you (SPOTIFIND_SHARED_<KEY>, from the bundle's shared.env).
 */
export function configValue(key: string): string | undefined {
  return process.env[key] || readConfigFile()[key] || sharedValue(key);
}

/** A default built into a shared copy of Spotifind, e.g. the sharer's Last.fm key or Spotify Client ID. */
export function sharedValue(key: string): string | undefined {
  return process.env[`SPOTIFIND_SHARED_${key}`] || undefined;
}

/** Who shared this copy (shown as "ask Ethan to add you"), if it's a shared copy. */
export function sharedBy(): string | undefined {
  return sharedValue("SHARED_BY");
}

/** Save a setting to config.env and apply it immediately (no restart needed). */
export function setConfigValue(key: string, value: string) {
  mkdirSync(SUPPORT_DIR, { recursive: true });
  let text = existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, "utf8") : "# Spotifind settings\n";
  const line = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (line.test(text)) text = text.replace(line, `${key}=${value}`);
  else text = text.replace(/\n?$/, `\n${key}=${value}\n`);
  writeFileSync(CONFIG_FILE, text, { mode: 0o600 });
  chmodSync(CONFIG_FILE, 0o600); // mode above only applies when the file is new
  process.env[key] = value;
}
