// Implementasi Business Login for Instagram (Instagram API with Instagram Login).
// Referensi resmi:
// https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
// https://developers.facebook.com/docs/instagram-platform/reference/access_token
//
// Scope yang diminta HARUS sudah dicentang/di-approve di Meta App Dashboard,
// kalau tidak Meta akan menolak authorization request.
// manage_messages & manage_comments ditambah untuk fitur DM (Tahap 3) dan
// Comments (Tahap 4) — akun yang sudah connect dengan scope lama harus
// reconnect ulang supaya token baru punya izin ini.
const SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

import { randomBytes } from "node:crypto";
import { config } from "../config.js";

export function buildAuthorizeUrl(state: string): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", config.instagramAppId);
  url.searchParams.set("redirect_uri", config.instagramRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export function generateState(): string {
  return randomBytes(24).toString("hex");
}

interface ShortLivedTokenResponse {
  access_token: string;
  user_id: string;
  permissions: string[];
}

// Step 1: authorization code -> short-lived token (berlaku 1 jam).
// Dilakukan server-side karena butuh app secret.
export async function exchangeCodeForShortLivedToken(code: string): Promise<ShortLivedTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.instagramAppId,
    client_secret: config.instagramAppSecret,
    grant_type: "authorization_code",
    redirect_uri: config.instagramRedirectUri,
    code,
  });

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gagal menukar authorization code (${res.status}): ${text}`);
  }

  return (await res.json()) as ShortLivedTokenResponse;
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // detik, biasanya 5184000 (60 hari)
}

// Step 2: short-lived -> long-lived token (berlaku 60 hari).
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<LongLivedTokenResponse> {
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.instagramAppSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gagal menukar long-lived token (${res.status}): ${text}`);
  }

  return (await res.json()) as LongLivedTokenResponse;
}

// Refresh long-lived token sebelum expired. Syarat Meta: token minimal
// berumur 24 jam dan belum expired.
export async function refreshLongLivedToken(currentToken: string): Promise<LongLivedTokenResponse> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", currentToken);

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gagal refresh token (${res.status}): ${text}`);
  }

  return (await res.json()) as LongLivedTokenResponse;
}
