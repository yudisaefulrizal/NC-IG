import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { verifySessionToken } from "../lib/session.js";

export const SESSION_COOKIE_NAME = "nc_ig_session";
// Cookie terpisah untuk "akun Instagram mana yang sedang dikelola". Bukan
// data sensitif (cuma preferensi UI, bukan kredensial) jadi tidak perlu
// HMAC-sign seperti session login — tapi tetap httpOnly, dan nilainya
// SELALU divalidasi ulang di server (lihat getActiveConnectionId) sebelum
// dipakai, supaya tidak bisa dipakai mengakses akun yang bukan miliknya.
const ACTIVE_CONNECTION_COOKIE_NAME = "nc_ig_active_connection";

// Parser cookie minimal — tanpa dependency cookie-parser, cukup untuk
// cookie yang kita kontrol sendiri formatnya.
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

// Baca connectionId dari cookie. TIDAK memvalidasi apakah connection itu
// benar-benar ada/masih aktif — caller (route) wajib tetap panggil
// getConnectionById() dan cek hasilnya sebelum dipakai.
export function getActiveConnectionId(req: Request): number | undefined {
  const raw = readCookie(req, ACTIVE_CONNECTION_COOKIE_NAME);
  if (!raw) return undefined;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export { ACTIVE_CONNECTION_COOKIE_NAME };

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readCookie(req, SESSION_COOKIE_NAME);

  if (verifySessionToken(token, config.sessionSecret)) {
    next();
    return;
  }

  if (req.path.startsWith("/api/")) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  res.redirect("/login.html");
}
