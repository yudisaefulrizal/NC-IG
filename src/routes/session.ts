import { Router } from "express";
import { config } from "../config.js";
import { verifyPassword, createSessionToken } from "../lib/session.js";
import { SESSION_COOKIE_NAME, ACTIVE_CONNECTION_COOKIE_NAME } from "../middleware/requireAuth.js";
import { getConnectionById } from "../db.js";

export const sessionRouter = Router();

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

// Login operator tunggal. Tidak ada konsep username — hanya satu password
// admin dari .env. Bukan OAuth Instagram (lihat routes/auth.ts untuk itu).
sessionRouter.post("/login", (req, res) => {
  const { password } = req.body as { password?: string };

  if (typeof password !== "string" || !verifyPassword(password, config.adminPasswordHash)) {
    res.status(401).json({ ok: false, error: "Password salah." });
    return;
  }

  const token = createSessionToken(config.sessionSecret, SESSION_TTL_MS);
  const isHttps = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    maxAge: SESSION_TTL_MS,
  });
  res.json({ ok: true });
});

sessionRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME);
  res.clearCookie(ACTIVE_CONNECTION_COOKIE_NAME);
  res.json({ ok: true });
});

// Pilih akun Instagram mana yang sedang dikelola (dipakai halaman DM,
// Comments, Posts, Stories). Divalidasi di sini supaya cookie tidak bisa
// diisi ID akun yang tidak ada/sudah disconnect.
sessionRouter.post("/active-connection", (req, res) => {
  const { connectionId } = req.body as { connectionId?: number };

  if (typeof connectionId !== "number" || !getConnectionById(connectionId)) {
    res.status(400).json({ ok: false, error: "Akun tidak ditemukan atau sudah terputus." });
    return;
  }

  const isHttps = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
  // Ikut umur session login (7 hari) — kalau login habis, pilihan akun
  // juga ikut basi, wajar dipilih ulang setelah login lagi.
  res.cookie(ACTIVE_CONNECTION_COOKIE_NAME, String(connectionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});
