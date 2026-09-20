import { Router, type Request, type Response } from "express";
import { getConnectionById, listComments, getComment, insertCommentReply, type Role } from "../db.js";
import { replyToComment } from "../instagram/comments.js";
import { getActiveConnectionId } from "../middleware/requireAuth.js";

export const commentsRouter = Router();

function requireActiveConnection(req: Request, res: Response) {
  const connectionId = getActiveConnectionId(req);
  if (!connectionId) return undefined;
  const account = res.locals.account as { id: string; role: Role };
  return getConnectionById(connectionId, account.id, account.role);
}

commentsRouter.get("/", async (req, res) => {
  const conn = await requireActiveConnection(req, res);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }
  res.json({ comments: await listComments(conn.id) });
});

commentsRouter.post("/:id/reply", async (req, res) => {
  const conn = await requireActiveConnection(req, res);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }

  const commentId = req.params.id;
  const comment = await getComment(conn.id, commentId);
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
    await insertCommentReply({ commentId, replyCommentId: result.id, text });
    res.json({ ok: true, replyId: result.id });
  } catch (err) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : "Gagal membalas komentar" });
  }
});
