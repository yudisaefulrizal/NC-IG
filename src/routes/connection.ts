import { Router } from "express";
import { listActiveConnections, getConnectionById, markConnectionRevoked, type Role } from "../db.js";
import { fetchProfile } from "../instagram/client.js";
import { createImageContainer, waitForContainerReady, publishContainer } from "../instagram/publish.js";
import { config } from "../config.js";
import { getActiveConnectionId } from "../middleware/requireAuth.js";

export const connectionRouter = Router();

// Daftar koneksi: owner melihat SEMUA akun, user biasa hanya miliknya
// sendiri. Token TIDAK PERNAH dikirim ke browser.
connectionRouter.get("/", async (req, res) => {
  const account = res.locals.account as { id: string; role: Role };
  const connections = (await listActiveConnections(account.id, account.role)).map((c) => ({
    id: c.id,
    username: c.username,
    instagramUserId: c.instagram_user_id,
    scopes: c.scopes.split(","),
    tokenExpiresAt: c.token_expires_at,
  }));

  res.json({ connections, activeConnectionId: getActiveConnectionId(req) ?? null });
});

// Panggilan API ringan untuk membuktikan token akun ini masih hidup.
connectionRouter.post("/:id/test-api", async (req, res) => {
  const account = res.locals.account as { id: string; role: Role };
  const conn = await getConnectionById(Number(req.params.id), account.id, account.role);
  if (!conn) {
    res.status(404).json({ error: "Akun tidak ditemukan." });
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
connectionRouter.post("/:id/test-publish", async (req, res) => {
  const account = res.locals.account as { id: string; role: Role };
  const conn = await getConnectionById(Number(req.params.id), account.id, account.role);
  if (!conn) {
    res.status(404).json({ error: "Akun tidak ditemukan." });
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

connectionRouter.post("/:id/disconnect", async (req, res) => {
  const account = res.locals.account as { id: string; role: Role };
  const conn = await getConnectionById(Number(req.params.id), account.id, account.role);
  if (conn) await markConnectionRevoked(conn.instagram_user_id);
  res.json({ ok: true });
});
