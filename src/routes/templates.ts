import { Router, type Request, type Response } from "express";
import {
  getConnectionById,
  listReplyTemplates,
  getReplyTemplate,
  createReplyTemplate,
  updateReplyTemplate,
  deleteReplyTemplate,
  type Role,
} from "../db.js";
import { getActiveConnectionId } from "../middleware/requireAuth.js";

export const templatesRouter = Router();

function requireActiveConnection(req: Request, res: Response) {
  const connectionId = getActiveConnectionId(req);
  if (!connectionId) return undefined;
  const account = res.locals.account as { id: string; role: Role };
  return getConnectionById(connectionId, account.id, account.role);
}

function readInput(body: unknown): { title: string; text: string } | null {
  if (!body || typeof body !== "object") return null;
  const { title, text } = body as Record<string, unknown>;
  if (typeof title !== "string" || title.trim() === "") return null;
  if (typeof text !== "string" || text.trim() === "") return null;
  if (title.length > 255) return null;
  return { title: title.trim(), text: text.trim() };
}

templatesRouter.get("/", async (req, res) => {
  const conn = await requireActiveConnection(req, res);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }
  res.json({ templates: await listReplyTemplates(conn.id) });
});

templatesRouter.post("/", async (req, res) => {
  const conn = await requireActiveConnection(req, res);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }

  const input = readInput(req.body);
  if (!input) {
    res.status(400).json({ ok: false, error: "Judul dan isi template wajib diisi." });
    return;
  }

  const template = await createReplyTemplate({ connectionId: conn.id, title: input.title, text: input.text });
  res.status(201).json({ ok: true, template });
});

templatesRouter.put("/:id", async (req, res) => {
  const conn = await requireActiveConnection(req, res);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }

  const input = readInput(req.body);
  if (!input) {
    res.status(400).json({ ok: false, error: "Judul dan isi template wajib diisi." });
    return;
  }

  const updated = await updateReplyTemplate(conn.id, Number(req.params.id), input);
  if (!updated) {
    res.status(404).json({ ok: false, error: "Template tidak ditemukan." });
    return;
  }
  res.json({ ok: true });
});

templatesRouter.delete("/:id", async (req, res) => {
  const conn = await requireActiveConnection(req, res);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }

  const deleted = await deleteReplyTemplate(conn.id, Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ ok: false, error: "Template tidak ditemukan." });
    return;
  }
  res.json({ ok: true });
});

// Dipakai getReplyTemplate langsung oleh halaman DM/Comments kalau perlu
// ambil satu template detail (saat ini list saja sudah cukup untuk dropdown,
// tapi endpoint ini berguna kalau nanti perlu re-fetch teks lengkap).
templatesRouter.get("/:id", async (req, res) => {
  const conn = await requireActiveConnection(req, res);
  if (!conn) {
    res.status(400).json({ ok: false, error: "Pilih akun Instagram aktif dulu." });
    return;
  }

  const template = await getReplyTemplate(conn.id, Number(req.params.id));
  if (!template) {
    res.status(404).json({ ok: false, error: "Template tidak ditemukan." });
    return;
  }
  res.json({ template });
});
