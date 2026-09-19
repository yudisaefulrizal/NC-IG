import { Router } from "express";
import { getActiveConnection, markConnectionRevoked } from "../db.js";
import { fetchProfile } from "../instagram/client.js";
import { createImageContainer, waitForContainerReady, publishContainer } from "../instagram/publish.js";
import { config } from "../config.js";

export const connectionRouter = Router();

// Status koneksi untuk ditampilkan di UI. Token TIDAK PERNAH dikirim ke browser.
connectionRouter.get("/status", (_req, res) => {
  const conn = getActiveConnection();
  if (!conn) {
    res.json({ connected: false });
    return;
  }
  res.json({
    connected: true,
    username: conn.username,
    instagramUserId: conn.instagram_user_id,
    scopes: conn.scopes.split(","),
    tokenExpiresAt: conn.token_expires_at,
  });
});

// Panggilan API ringan untuk membuktikan token masih hidup.
connectionRouter.post("/test-api", async (_req, res) => {
  const conn = getActiveConnection();
  if (!conn) {
    res.status(400).json({ error: "Belum ada akun Instagram yang terhubung." });
    return;
  }

  try {
    const profile = await fetchProfile(conn.access_token);
    res.json({ ok: true, profile });
  } catch (err) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : "Gagal memanggil API" });
  }
});

// Prototype publishing: pakai gambar contoh yang di-serve NC-IG sendiri.
// image_url wajib bisa diakses publik oleh server Meta (bukan localhost),
// jadi ini hanya akan berhasil ketika PUBLIC_BASE_URL menunjuk ke tunnel/domain aktif.
connectionRouter.post("/test-publish", async (req, res) => {
  const conn = getActiveConnection();
  if (!conn) {
    res.status(400).json({ error: "Belum ada akun Instagram yang terhubung." });
    return;
  }

  const caption = typeof req.body?.caption === "string" ? req.body.caption : "Test post dari NC-IG";
  const imageUrl = `${config.publicBaseUrl}/sample.jpg`;

  try {
    const containerId = await createImageContainer({
      igUserId: conn.instagram_user_id,
      accessToken: conn.access_token,
      imageUrl,
      caption,
    });
    await waitForContainerReady(containerId, conn.access_token);
    const mediaId = await publishContainer({
      igUserId: conn.instagram_user_id,
      accessToken: conn.access_token,
      creationId: containerId,
    });
    res.json({ ok: true, mediaId });
  } catch (err) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : "Gagal publish" });
  }
});

connectionRouter.post("/disconnect", (_req, res) => {
  const conn = getActiveConnection();
  if (conn) markConnectionRevoked(conn.instagram_user_id);
  res.json({ ok: true });
});
