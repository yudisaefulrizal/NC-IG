import { Router, type Request } from "express";
import { getConnectionById, insertPost, listPosts } from "../db.js";
import { createImageContainer, waitForContainerReady, publishContainer } from "../instagram/publish.js";
import { getActiveConnectionId } from "../middleware/requireAuth.js";

export const postsRouter = Router();

function requireActiveConnection(req: Request) {
  const connectionId = getActiveConnectionId(req);
  if (!connectionId) return undefined;
  return getConnectionById(connectionId);
}

postsRouter.get("/", (req, res) => {
  const conn = requireActiveConnection(req);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }
  res.json({ posts: listPosts(conn.id) });
});

postsRouter.post("/", async (req, res) => {
  const conn = requireActiveConnection(req);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }

  const { imageUrl, caption } = req.body as { imageUrl?: string; caption?: string };
  if (typeof imageUrl !== "string" || imageUrl.trim() === "") {
    res.status(400).json({ ok: false, error: "Field 'imageUrl' wajib diisi." });
    return;
  }

  let containerId: string | undefined;
  try {
    containerId = await createImageContainer({
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

    insertPost({ connectionId: conn.id, igMediaId: mediaId, containerId, caption, imageUrl, status: "published" });
    res.json({ ok: true, mediaId });
  } catch (err) {
    // Simpan tetap sebagai riwayat (status failed) supaya bisa diaudit,
    // bukan cuma dibuang begitu saja.
    const message = err instanceof Error ? err.message : "Gagal publish";
    insertPost({ connectionId: conn.id, containerId, caption, imageUrl, status: "failed", errorMessage: message });
    res.status(502).json({ ok: false, error: message });
  }
});
