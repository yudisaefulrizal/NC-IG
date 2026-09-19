import { Router, type Request } from "express";
import { getConnectionById, listThreads, getThread, getThreadMessages, insertOutboundMessage } from "../db.js";
import { sendTextMessage } from "../instagram/messaging.js";
import { getActiveConnectionId } from "../middleware/requireAuth.js";

export const messagesRouter = Router();

function requireActiveConnection(req: Request) {
  const connectionId = getActiveConnectionId(req);
  if (!connectionId) return undefined;
  return getConnectionById(connectionId);
}

messagesRouter.get("/threads", (req, res) => {
  const conn = requireActiveConnection(req);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }
  res.json({ threads: listThreads(conn.id) });
});

messagesRouter.get("/threads/:id", (req, res) => {
  const conn = requireActiveConnection(req);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }

  const thread = getThread(conn.id, Number(req.params.id));
  if (!thread) {
    res.status(404).json({ ok: false, error: "Thread tidak ditemukan." });
    return;
  }
  res.json({ thread, messages: getThreadMessages(thread.id) });
});

messagesRouter.post("/threads/:id/reply", async (req, res) => {
  const conn = requireActiveConnection(req);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }

  const thread = getThread(conn.id, Number(req.params.id));
  if (!thread) {
    res.status(404).json({ ok: false, error: "Thread tidak ditemukan." });
    return;
  }

  const { text } = req.body as { text?: string };
  if (typeof text !== "string" || text.trim() === "") {
    res.status(400).json({ ok: false, error: "Field 'text' wajib diisi." });
    return;
  }

  try {
    const result = await sendTextMessage({
      igUserId: conn.instagram_user_id,
      accessToken: conn.access_token,
      recipientId: thread.ig_scoped_id,
      text,
    });
    insertOutboundMessage({ threadId: thread.id, mid: result.message_id, text });
    res.json({ ok: true, messageId: result.message_id });
  } catch (err) {
    // Kegagalan paling umum: di luar 24 jam customer service window,
    // Meta menolak pesan teks bebas untuk kontak yang sudah lama tidak chat.
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : "Gagal mengirim pesan" });
  }
});
