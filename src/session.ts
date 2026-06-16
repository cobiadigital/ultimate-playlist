import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { TokenSet } from './spotify/auth';

const SESSION_COOKIE = 'up_session';
const STATE_COOKIE = 'up_oauth_state';

// --- AES-GCM encryption of small JSON payloads, using Web Crypto (available on Workers) ---

async function deriveKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encrypts a JSON-serialisable value into an opaque `iv.ciphertext` string. */
export async function encryptJson(value: unknown, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** Decrypts a value produced by `encryptJson`; returns null on any tampering/format error. */
export async function decryptJson<T>(token: string, secret: string): Promise<T | null> {
  try {
    const [ivPart, ctPart] = token.split('.');
    if (!ivPart || !ctPart) return null;
    const key = await deriveKey(secret);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(ivPart) },
      key,
      fromBase64Url(ctPart),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

// --- Session and OAuth-state cookie helpers ---

const baseCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/',
} as const;

export async function setSession(c: Context, tokens: TokenSet, secret: string): Promise<void> {
  setCookie(c, SESSION_COOKIE, await encryptJson(tokens, secret), baseCookieOptions);
}

export async function getSession(c: Context, secret: string): Promise<TokenSet | null> {
  const cookie = getCookie(c, SESSION_COOKIE);
  return cookie ? decryptJson<TokenSet>(cookie, secret) : null;
}

export async function setOAuthState(c: Context, state: string, secret: string): Promise<void> {
  // Short-lived: only needs to survive the redirect round-trip.
  setCookie(c, STATE_COOKIE, await encryptJson({ state }, secret), {
    ...baseCookieOptions,
    maxAge: 600,
  });
}

export async function consumeOAuthState(c: Context, secret: string): Promise<string | null> {
  const cookie = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, baseCookieOptions);
  if (!cookie) return null;
  const payload = await decryptJson<{ state: string }>(cookie, secret);
  return payload?.state ?? null;
}
