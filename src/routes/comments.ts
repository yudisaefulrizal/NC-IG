import { Router } from "express";
import { getActiveConnection, listComments, getComment, insertCommentReply } from "../db.js";
import { replyToComment } from "../instagram/comments.js";

export const commentsRouter = Router();

commentsRouter.get("/", (_req, res) => {
  res.json({ comments: listComments() });
});

commentsRouter.post("/:id/reply", async (req, res) => {
  const commentId = req.params.id;
  const comment = getComment(commentId);
  if (!comment) {
    res.status(404).json({ ok: false, error: "Komentar tidak ditemukan." });
    return;
  }

  const { text } = req.body as { text?: string };
  if (typeof text !== "string" || text.trim() === "") {
    res.status(400).json({ ok: false, error: "Field 'text' wajib diisi." });
    return;
  }

  const conn = getActiveConnection();
  if (!conn) {
    res.status(400).json({ ok: false, error: "Belum ada akun Instagram yang terhubung." });
    return;
  }

  try {
    const result = await replyToComment({ commentId, accessToken: conn.access_token, message: text });
    insertCommentReply({ commentId, replyCommentId: result.id, text });
    res.json({ ok: true, replyId: result.id });
  } catch (err) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : "Gagal membalas komentar" });
  }
});
