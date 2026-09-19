import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { verifySessionToken } from "../lib/session.js";

export const SESSION_COOKIE_NAME = "nc_ig_session";

// Parser cookie minimal — tanpa dependency cookie-parser, cukup untuk satu
// cookie session yang kita kontrol sendiri formatnya.
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

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
