/**
 * RitaWapp wsApi Token Management & Auth
 */

import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

export async function getOrCreateWsApiToken(): Promise<string> {
  const localAppData = Deno.env.get("LOCALAPPDATA") ||
    `${Deno.env.get("USERPROFILE")}\\AppData\\Local`;
  const tokenDir = `${localAppData}\\RitaWapp`;
  const tokenFile = `${tokenDir}\\wsapi.token`;

  try {
    const existing = await Deno.readTextFile(tokenFile);
    if (existing.trim().length >= 32) {
      return existing.trim();
    }
  } catch {
    // Generate new token
  }

  await Deno.mkdir(tokenDir, { recursive: true });
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = encodeHex(raw);
  await Deno.writeTextFile(tokenFile, token);
  return token;
}

export function verifyWsToken(expected: string, provided?: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}
