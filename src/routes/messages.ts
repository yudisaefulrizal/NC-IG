import { Router } from "express";
import { getActiveConnection, listThreads, getThread, getThreadMessages, insertOutboundMessage } from "../db.js";
import { sendTextMessage } from "../instagram/messaging.js";

export const messagesRouter = Router();

messagesRouter.get("/threads", (_req, res) => {
  res.json({ threads: listThreads() });
});

messagesRouter.get("/threads/:id", (req, res) => {
  const threadId = Number(req.params.id);
  const thread = getThread(threadId);
  if (!thread) {
    res.status(404).json({ ok: false, error: "Thread tidak ditemukan." });
    return;
  }
  res.json({ thread, messages: getThreadMessages(threadId) });
});

messagesRouter.post("/threads/:id/reply", async (req, res) => {
  const threadId = Number(req.params.id);
  const thread = getThread(threadId);
  if (!thread) {
    res.status(404).json({ ok: false, error: "Thread tidak ditemukan." });
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
    const result = await sendTextMessage({
      igUserId: conn.instagram_user_id,
      accessToken: conn.access_token,
      recipientId: thread.ig_scoped_id,
      text,
    });
    insertOutboundMessage({ threadId, mid: result.message_id, text });
    res.json({ ok: true, messageId: result.message_id });
  } catch (err) {
    // Kegagalan paling umum: di luar 24 jam customer service window,
    // Meta menolak pesan teks bebas untuk kontak yang sudah lama tidak chat.
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : "Gagal mengirim pesan" });
  }
});
