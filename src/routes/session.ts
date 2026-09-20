import { randomUUID } from "node:crypto";
import { Router } from "express";
import { hashPassword, verifyPassword, generateSessionToken, hashToken } from "../lib/session.js";
import { SESSION_COOKIE_NAME, ACTIVE_CONNECTION_COOKIE_NAME } from "../middleware/requireAuth.js";
import { createAccount, findAccountByEmail, createSession, deleteSession, getConnectionById } from "../db.js";

// Publik: register/login/logout tidak butuh sesi yang sudah ada (logout
// aman dipanggil tanpa sesi valid juga — cukup no-op).
export const sessionRouter = Router();
// Butuh sesi valid (dipasang SETELAH requireAuth di server.ts) karena
// perlu tahu res.locals.account untuk validasi kepemilikan connection.
export const activeConnectionRouter = Router();

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari
const EMAIL_RE = /^\S+@\S+\.\S+$/;

function isHttps(req: import("express").Request): boolean {
  return req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
}

// Validasi & normalisasi input email+password dipakai bareng oleh
// register & login. Return null kalau formatnya tidak valid.
function readCredentials(body: unknown): { email: string; password: string } | null {
  if (!body || typeof body !== "object") return null;
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string") return null;
  if (!EMAIL_RE.test(email) || email.length > 254) return null;
  if (password.length < 8 || password.length > 128) return null;
  return { email: email.trim().toLowerCase(), password };
}

// Signup akun biasa (role default 'user'). Tidak ada pembuatan akun owner
// dari sini — owner pertama dibuat lewat skrip migrate:from-sqlite.
sessionRouter.post("/register", async (req, res) => {
  const input = readCredentials(req.body);
  if (!input) {
    res.status(400).json({ ok: false, error: "Email tidak valid atau password minimal 8 karakter." });
    return;
  }

  const existing = await findAccountByEmail(input.email);
  if (existing) {
    res.status(409).json({ ok: false, error: "Email sudah terdaftar." });
    return;
  }

  await createAccount({
    id: randomUUID(),
    email: input.email,
    passwordHash: hashPassword(input.password),
    role: "user",
  });

  res.status(201).json({ ok: true });
});

sessionRouter.post("/login", async (req, res) => {
  const input = readCredentials(req.body);
  if (!input) {
    res.status(401).json({ ok: false, error: "Email atau password salah." });
    return;
  }

  const account = await findAccountByEmail(input.email);
  if (!account || !verifyPassword(input.password, account.password_hash)) {
    res.status(401).json({ ok: false, error: "Email atau password salah." });
    return;
  }

  const token = generateSessionToken();
  await createSession({ tokenHash: hashToken(token), accountId: account.id, ttlMs: SESSION_TTL_MS });

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    maxAge: SESSION_TTL_MS,
  });
  res.json({ ok: true });
});

sessionRouter.post("/logout", async (req, res) => {
  const token = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  if (token) await deleteSession(hashToken(decodeURIComponent(token)));

  res.clearCookie(SESSION_COOKIE_NAME);
  res.clearCookie(ACTIVE_CONNECTION_COOKIE_NAME);
  res.json({ ok: true });
});

// Pilih akun Instagram mana yang sedang dikelola (dipakai halaman DM,
// Comments, Posts, Stories). Divalidasi di sini supaya cookie tidak bisa
// diisi ID akun yang tidak ada/bukan milik user ini (kecuali owner).
activeConnectionRouter.post("/active-connection", async (req, res) => {
  const { connectionId } = req.body as { connectionId?: number };
  const account = res.locals.account as { id: string; role: "owner" | "user" };

  if (typeof connectionId !== "number" || !(await getConnectionById(connectionId, account.id, account.role))) {
    res.status(400).json({ ok: false, error: "Akun tidak ditemukan atau sudah terputus." });
    return;
  }

  res.cookie(ACTIVE_CONNECTION_COOKIE_NAME, String(connectionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    // Ikut umur session login (7 hari) — kalau login habis, pilihan akun
    // juga ikut basi, wajar dipilih ulang setelah login lagi.
    maxAge: SESSION_TTL_MS,
  });
  res.json({ ok: true });
});
