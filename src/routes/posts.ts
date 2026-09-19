import { Router } from "express";
import { getActiveConnection, insertPost, listPosts } from "../db.js";
import { createImageContainer, waitForContainerReady, publishContainer } from "../instagram/publish.js";

export const postsRouter = Router();

postsRouter.get("/", (_req, res) => {
  res.json({ posts: listPosts() });
});

postsRouter.post("/", async (req, res) => {
  const { imageUrl, caption } = req.body as { imageUrl?: string; caption?: string };
  if (typeof imageUrl !== "string" || imageUrl.trim() === "") {
    res.status(400).json({ ok: false, error: "Field 'imageUrl' wajib diisi." });
    return;
  }

  const conn = getActiveConnection();
  if (!conn) {
    res.status(400).json({ ok: false, error: "Belum ada akun Instagram yang terhubung." });
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

    insertPost({ igMediaId: mediaId, containerId, caption, imageUrl, status: "published" });
    res.json({ ok: true, mediaId });
  } catch (err) {
    // Simpan tetap sebagai riwayat (status failed) supaya bisa diaudit,
    // bukan cuma dibuang begitu saja.
    const message = err instanceof Error ? err.message : "Gagal publish";
    insertPost({ containerId, caption, imageUrl, status: "failed", errorMessage: message });
    res.status(502).json({ ok: false, error: message });
  }
});
