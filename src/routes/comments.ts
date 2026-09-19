import { Router, type Request } from "express";
import { getConnectionById, listComments, getComment, insertCommentReply } from "../db.js";
import { replyToComment } from "../instagram/comments.js";
import { getActiveConnectionId } from "../middleware/requireAuth.js";

export const commentsRouter = Router();

function requireActiveConnection(req: Request) {
  const connectionId = getActiveConnectionId(req);
  if (!connectionId) return undefined;
  return getConnectionById(connectionId);
}

commentsRouter.get("/", (req, res) => {
  const conn = requireActiveConnection(req);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }
  res.json({ comments: listComments(conn.id) });
});

commentsRouter.post("/:id/reply", async (req, res) => {
  const conn = requireActiveConnection(req);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }

  const commentId = req.params.id;
  const comment = getComment(conn.id, commentId);
  if (!comment) {
    res.status(404).json({ ok: false, error: "Komentar tidak ditemukan." });
    return;
  }

  const { text } = req.body as { text?: string };
  if (typeof text !== "string" || text.trim() === "") {
    res.status(400).json({ ok: false, error: "Field 'text' wajib diisi." });
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
