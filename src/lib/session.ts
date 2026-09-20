// Util murni untuk password hashing & session token, tanpa dependency di
// luar node:crypto — konsisten dengan gaya webhookSignature.ts/signedRequest.ts.
import { scryptSync, randomBytes, createHash, timingSafeEqual } from "node:crypto";

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

// Session sekarang DB-backed (tabel login_sessions), bukan token stateless
// HMAC lagi — supaya logout/suspend bisa langsung mencabut sesi dari server.
// Cookie berisi token MENTAH (random, tebakan praktis mustahil); yang
// disimpan di DB hanya hash SHA-256-nya, supaya kebocoran isi tabel
// login_sessions tidak langsung memberi akses (mirip prinsip password hash,
// walau SHA-256 cukup di sini karena token sendiri sudah punya entropi tinggi
// — beda dengan password yang dipilih manusia dan butuh scrypt).
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
