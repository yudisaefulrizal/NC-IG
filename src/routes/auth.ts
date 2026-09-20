import { Router } from "express";
import {
  buildAuthorizeUrl,
  generateState,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
} from "../instagram/oauth.js";
import { fetchProfile } from "../instagram/client.js";
import { saveOAuthState, consumeOAuthState, upsertConnection } from "../db.js";

// Mulai flow OAuth: hanya boleh dipicu operator yang sudah login (di-mount
// di server.ts SETELAH requireAuth). State disimpan bareng account_id milik
// operator ini, supaya callback (yang di luar requireAuth) tetap tahu siapa
// pemiliknya tanpa bergantung ke cookie session masih ada saat redirect.
export const authRouter = Router();
authRouter.get("/instagram", async (req, res) => {
  const account = res.locals.account as { id: string };
  const state = generateState();
  await saveOAuthState(state, account.id);
  res.redirect(buildAuthorizeUrl(state));
});

// Callback dari Instagram setelah user approve/tolak — dipanggil via redirect
// browser dari Meta, BUKAN dari konteks session operator. Router terpisah,
// di-mount di server.ts SEBELUM requireAuth supaya tetap terbuka. Identitas
// pemilik didapat dari account_id yang tersimpan bareng oauth `state`
// (lihat authRouter di atas), bukan dari cookie session.
export const authCallbackRouter = Router();
authCallbackRouter.get("/instagram/callback", async (req, res) => {
  const { code, state, error, error_reason: errorReason } = req.query as Record<string, string | undefined>;

  if (error) {
    console.warn(`Instagram OAuth ditolak/dibatalkan: ${error} (${errorReason ?? "-"})`);
    res.redirect("/?connect=cancelled");
    return;
  }

  if (!state) {
    res.status(400).send("State OAuth tidak valid atau sudah kedaluwarsa. Silakan ulangi Connect Instagram.");
    return;
  }

  const accountId = await consumeOAuthState(state);
  if (!accountId) {
    res.status(400).send("State OAuth tidak valid atau sudah kedaluwarsa. Silakan ulangi Connect Instagram.");
    return;
  }

  if (!code) {
    res.status(400).send("Parameter code tidak ditemukan pada callback.");
    return;
  }

  try {
    // code -> short-lived token -> long-lived token (60 hari)
    const shortLived = await exchangeCodeForShortLivedToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const profile = await fetchProfile(longLived.access_token);

    const expiresAt = new Date(Date.now() + longLived.expires_in * 1000).toISOString();

    await upsertConnection({
      accountId,
      instagramUserId: profile.user_id,
      username: profile.username,
      accessToken: longLived.access_token,
      tokenExpiresAt: expiresAt,
      scopes: shortLived.permissions.join(","),
    });

    res.redirect("/?connect=success");
  } catch (err) {
    // Tidak menulis token/secret ke log, hanya pesan error.
    console.error("Gagal menyelesaikan OAuth Instagram:", err instanceof Error ? err.message : err);
    res.status(502).send("Gagal menghubungkan akun Instagram. Coba lagi beberapa saat.");
  }
});
