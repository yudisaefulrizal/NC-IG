import { Router } from "express";
import { config } from "../config.js";
import { verifyPassword, createSessionToken } from "../lib/session.js";
import { SESSION_COOKIE_NAME } from "../middleware/requireAuth.js";

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
  res.json({ ok: true });
});
