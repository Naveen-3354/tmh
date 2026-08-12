/**
 * Symmetric encryption for third-party secrets we must be able to *use*.
 *
 * Passwords and our own access tokens are hashed — we only ever need to
 * compare them. A user's Gemini API key is different: we have to send the
 * original value to Google, so it has to be recoverable, which means real
 * encryption rather than a digest.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than silently yielding garbage. The key lives in ENCRYPTION_KEY, outside the
 * database, so a database dump on its own reveals nothing.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Marks the format so the scheme can be changed later without ambiguity. */
const PREFIX = 'v1';

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new EncryptionError(
      'ENCRYPTION_KEY is not set. Generate one with:\n' +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new EncryptionError(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes; got ${key.length}. It should be base64 of 32 random bytes.`,
    );
  }
  return key;
}

/** True when a usable encryption key is configured. */
export function encryptionAvailable(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a secret for storage. Output is safe to put in a text column. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/**
 * Recover a stored secret.
 *
 * @throws EncryptionError if the value was not produced by encryptSecret, or
 *   if it has been altered — GCM authentication makes tampering detectable
 *   rather than silently producing wrong plaintext.
 */
export function decryptSecret(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new EncryptionError('Stored secret is not in the expected format.');
  }

  const [, ivPart, tagPart, dataPart] = parts as [string, string, string, string];
  const iv = Buffer.from(ivPart, 'base64');
  const tag = Buffer.from(tagPart, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new EncryptionError('Stored secret has an invalid header.');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key or tampered payload; the two are deliberately indistinguishable.
    throw new EncryptionError('Stored secret could not be decrypted.');
  }
}

/** Constant-time comparison, for callers that need to check a secret. */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
