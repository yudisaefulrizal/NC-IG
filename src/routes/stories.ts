import { Router } from "express";
import { getActiveConnection, insertStory, listStories } from "../db.js";
import { createImageContainer, waitForContainerReady, publishContainer } from "../instagram/publish.js";

export const storiesRouter = Router();

storiesRouter.get("/", (_req, res) => {
  res.json({ stories: listStories() });
});

storiesRouter.post("/", async (req, res) => {
  const { imageUrl } = req.body as { imageUrl?: string };
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
    // Tidak pernah kirim caption — Stories tidak mendukungnya (lihat
    // catatan di instagram/publish.ts).
    containerId = await createImageContainer({
      igUserId: conn.instagram_user_id,
      accessToken: conn.access_token,
      imageUrl,
      mediaType: "STORIES",
    });
    await waitForContainerReady(containerId, conn.access_token);
    const mediaId = await publishContainer({
      igUserId: conn.instagram_user_id,
      accessToken: conn.access_token,
      creationId: containerId,
    });

    insertStory({ igMediaId: mediaId, containerId, imageUrl, status: "published" });
    res.json({ ok: true, mediaId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal publish story";
    insertStory({ containerId, imageUrl, status: "failed", errorMessage: message });
    res.status(502).json({ ok: false, error: message });
  }
});
