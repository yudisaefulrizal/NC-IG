// Util murni untuk password hashing & session token, tanpa dependency di
// luar node:crypto — konsisten dengan gaya webhookSignature.ts/signedRequest.ts.
import { scryptSync, randomBytes, createHmac, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

// Token stateless: payload "{exp}" (base64url) + "." + signature HMAC-SHA256
// (base64url) dari payload, ditandatangani dengan SESSION_SECRET. Tidak ada
// penyimpanan di DB — verifikasi cukup cek signature + expiry.
export function createSessionToken(secret: string, ttlMs: number): string {
  const exp = Date.now() + ttlMs;
  const payload = base64url(Buffer.from(JSON.stringify({ exp })));
  const signature = base64url(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined, secret: string): boolean {
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expectedSignature = base64url(createHmac("sha256", secret).update(payload).digest());
  const expectedBuf = Buffer.from(expectedSignature);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return false;
  }

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp: number };
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}
