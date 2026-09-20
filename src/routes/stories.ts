import { Router, type Request, type Response } from "express";
import { getConnectionById, insertStory, listStories, type Role } from "../db.js";
import { createImageContainer, waitForContainerReady, publishContainer } from "../instagram/publish.js";
import { getActiveConnectionId } from "../middleware/requireAuth.js";

export const storiesRouter = Router();

function requireActiveConnection(req: Request, res: Response) {
  const connectionId = getActiveConnectionId(req);
  if (!connectionId) return undefined;
  const account = res.locals.account as { id: string; role: Role };
  return getConnectionById(connectionId, account.id, account.role);
}

storiesRouter.get("/", async (req, res) => {
  const conn = await requireActiveConnection(req, res);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }
  res.json({ stories: await listStories(conn.id) });
});

storiesRouter.post("/", async (req, res) => {
  const conn = await requireActiveConnection(req, res);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }

  const { imageUrl } = req.body as { imageUrl?: string };
  if (typeof imageUrl !== "string" || imageUrl.trim() === "") {
    res.status(400).json({ ok: false, error: "Field 'imageUrl' wajib diisi." });
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

    await insertStory({ connectionId: conn.id, igMediaId: mediaId, containerId, imageUrl, status: "published" });
    res.json({ ok: true, mediaId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal publish story";
    await insertStory({ connectionId: conn.id, containerId, imageUrl, status: "failed", errorMessage: message });
    res.status(502).json({ ok: false, error: message });
  }
});
