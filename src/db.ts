import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(path.join(config.dataDir, "nc-ig.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instagram_user_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    access_token TEXT NOT NULL,
    token_expires_at TEXT NOT NULL,
    scopes TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- active | revoked
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dm_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ig_scoped_id TEXT NOT NULL, -- Instagram-scoped ID lawan bicara
    username TEXT,
    last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES dm_threads(id),
    direction TEXT NOT NULL, -- inbound | outbound
    mid TEXT,                -- message id dari Meta, dipakai cek duplikat
    text TEXT,
    raw_payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_messages_mid ON dm_messages(mid) WHERE mid IS NOT NULL;

  CREATE TABLE IF NOT EXISTS ig_comments (
    id TEXT PRIMARY KEY, -- comment id asli dari Instagram, bukan autoincrement
    media_id TEXT,
    from_username TEXT,
    text TEXT,
    status TEXT NOT NULL DEFAULT 'unreplied', -- unreplied | replied
    raw_payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ig_comment_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id TEXT NOT NULL REFERENCES ig_comments(id),
    reply_comment_id TEXT, -- id balasan yang dikembalikan Meta setelah POST
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ig_media_id TEXT,     -- id dari Instagram, hanya terisi kalau sukses
    container_id TEXT,    -- creation_id sementara, untuk debug kalau gagal
    caption TEXT,
    image_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published', -- published | failed
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Tabel terpisah dari posts: story tidak punya caption dan sifatnya
  -- sementara (expire 24 jam di sisi Instagram), riwayat lokal ini hanya
  -- mencatat pernah dipublish, bukan status kadaluarsanya.
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ig_media_id TEXT,
    container_id TEXT,
    image_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published', -- published | failed
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrasi ringan tanpa framework: tambah kolom connection_id ke tabel yang
// dibuat sebelum dukungan multi-akun ada. Idempotent — aman dijalankan
// berkali-kali tiap startup. Baris lama (dari sebelum migrasi ini) akan
// punya connection_id NULL dan otomatis tidak muncul di query yang
// difilter per akun — cukup untuk data uji coba lama, tidak perlu backfill.
function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing("dm_threads", "connection_id", "INTEGER REFERENCES connections(id)");
addColumnIfMissing("ig_comments", "connection_id", "INTEGER REFERENCES connections(id)");
addColumnIfMissing("posts", "connection_id", "INTEGER REFERENCES connections(id)");
addColumnIfMissing("stories", "connection_id", "INTEGER REFERENCES connections(id)");

// Unique index terpisah (bukan inline UNIQUE di kolom) karena kolomnya
// ditambah belakangan via ALTER TABLE — sama IGSID boleh muncul di akun
// berbeda sebagai thread yang berbeda.
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_threads_connection_igscoped
    ON dm_threads(connection_id, ig_scoped_id);
`);

export interface Connection {
  id: number;
  instagram_user_id: string;
  username: string;
  access_token: string;
  token_expires_at: string;
  scopes: string;
  status: "active" | "revoked";
  created_at: string;
  updated_at: string;
}

export function upsertConnection(data: {
  instagramUserId: string;
  username: string;
  accessToken: string;
  tokenExpiresAt: string;
  scopes: string;
}): void {
  db.prepare(
    `INSERT INTO connections (instagram_user_id, username, access_token, token_expires_at, scopes, status, updated_at)
     VALUES (@instagramUserId, @username, @accessToken, @tokenExpiresAt, @scopes, 'active', datetime('now'))
     ON CONFLICT(instagram_user_id) DO UPDATE SET
       username = excluded.username,
       access_token = excluded.access_token,
       token_expires_at = excluded.token_expires_at,
       scopes = excluded.scopes,
       status = 'active',
       updated_at = datetime('now')`
  ).run(data);
}

// Semua akun yang masih tersambung (belum di-disconnect). Dasar untuk
// halaman Connection & pemilih akun di nav.
export function listActiveConnections(): Connection[] {
  return db.prepare(`SELECT * FROM connections WHERE status = 'active' ORDER BY id ASC`).all() as Connection[];
}

export function getConnectionById(id: number): Connection | undefined {
  return db.prepare(`SELECT * FROM connections WHERE id = ? AND status = 'active'`).get(id) as
    | Connection
    | undefined;
}

export function getConnectionByInstagramUserId(instagramUserId: string): Connection | undefined {
  return db
    .prepare(`SELECT * FROM connections WHERE instagram_user_id = ?`)
    .get(instagramUserId) as Connection | undefined;
}

export function markConnectionRevoked(instagramUserId: string): void {
  db.prepare(
    `UPDATE connections SET status = 'revoked', updated_at = datetime('now') WHERE instagram_user_id = ?`
  ).run(instagramUserId);
}

export function deleteConnectionData(instagramUserId: string): void {
  db.prepare(`DELETE FROM connections WHERE instagram_user_id = ?`).run(instagramUserId);
}

export function saveOAuthState(state: string): void {
  // Buang state basi (>10 menit) supaya tabel tidak tumbuh tanpa batas.
  db.prepare(`DELETE FROM oauth_states WHERE created_at < datetime('now', '-10 minutes')`).run();
  db.prepare(`INSERT INTO oauth_states (state) VALUES (?)`).run(state);
}

export function consumeOAuthState(state: string): boolean {
  const row = db.prepare(`SELECT state FROM oauth_states WHERE state = ?`).get(state);
  if (!row) return false;
  db.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(state);
  return true;
}

export function logWebhookEvent(eventType: string, payload: unknown): void {
  db.prepare(`INSERT INTO webhook_events (event_type, payload) VALUES (?, ?)`).run(
    eventType,
    JSON.stringify(payload)
  );
}

export interface DmThread {
  id: number;
  connection_id: number | null;
  ig_scoped_id: string;
  username: string | null;
  last_message_at: string;
  created_at: string;
}

export interface DmMessage {
  id: number;
  thread_id: number;
  direction: "inbound" | "outbound";
  mid: string | null;
  text: string | null;
  raw_payload: string | null;
  created_at: string;
}

// Cari thread yang sudah ada UNTUK AKUN INI, atau buat baru kalau ini
// kontak pertama kali (IGSID yang sama bisa jadi thread berbeda di akun
// Instagram yang berbeda).
export function upsertThread(connectionId: number, igScopedId: string): DmThread {
  const existing = db
    .prepare(`SELECT * FROM dm_threads WHERE connection_id = ? AND ig_scoped_id = ?`)
    .get(connectionId, igScopedId) as DmThread | undefined;
  if (existing) return existing;

  const result = db
    .prepare(`INSERT INTO dm_threads (connection_id, ig_scoped_id) VALUES (?, ?)`)
    .run(connectionId, igScopedId);
  return db.prepare(`SELECT * FROM dm_threads WHERE id = ?`).get(result.lastInsertRowid) as DmThread;
}

function touchThread(threadId: number): void {
  db.prepare(`UPDATE dm_threads SET last_message_at = datetime('now') WHERE id = ?`).run(threadId);
}

// Idempotent terhadap mid (Meta bisa retry pengiriman webhook yang sama).
// Return false kalau pesan dengan mid ini sudah pernah disimpan sebelumnya.
export function insertInboundMessage(data: {
  threadId: number;
  mid: string;
  text: string | undefined;
  rawPayload: unknown;
}): boolean {
  const existing = db.prepare(`SELECT id FROM dm_messages WHERE mid = ?`).get(data.mid);
  if (existing) return false;

  db.prepare(
    `INSERT INTO dm_messages (thread_id, direction, mid, text, raw_payload)
     VALUES (@threadId, 'inbound', @mid, @text, @rawPayload)`
  ).run({
    threadId: data.threadId,
    mid: data.mid,
    text: data.text ?? null,
    rawPayload: JSON.stringify(data.rawPayload),
  });
  touchThread(data.threadId);
  return true;
}

export function insertOutboundMessage(data: { threadId: number; mid?: string; text: string }): void {
  db.prepare(
    `INSERT INTO dm_messages (thread_id, direction, mid, text)
     VALUES (@threadId, 'outbound', @mid, @text)`
  ).run({ threadId: data.threadId, mid: data.mid ?? null, text: data.text });
  touchThread(data.threadId);
}

export function listThreads(connectionId: number): DmThread[] {
  return db
    .prepare(`SELECT * FROM dm_threads WHERE connection_id = ? ORDER BY last_message_at DESC`)
    .all(connectionId) as DmThread[];
}

// Ambil thread HANYA kalau benar milik connectionId ini — mencegah operator
// mengakses percakapan akun lain dengan menebak-nebak threadId di URL.
export function getThread(connectionId: number, threadId: number): DmThread | undefined {
  return db
    .prepare(`SELECT * FROM dm_threads WHERE id = ? AND connection_id = ?`)
    .get(threadId, connectionId) as DmThread | undefined;
}

export function getThreadMessages(threadId: number): DmMessage[] {
  return db
    .prepare(`SELECT * FROM dm_messages WHERE thread_id = ? ORDER BY id ASC`)
    .all(threadId) as DmMessage[];
}

export interface IgComment {
  id: string;
  connection_id: number | null;
  media_id: string | null;
  from_username: string | null;
  text: string | null;
  status: "unreplied" | "replied";
  raw_payload: string | null;
  created_at: string;
  updated_at: string;
}

// Idempotent: upsert supaya webhook retry/duplicate tidak bikin baris ganda
// (comment id dari Meta dipakai langsung sebagai primary key, sudah unik
// secara global lintas akun).
export function upsertComment(data: {
  id: string;
  connectionId: number;
  mediaId?: string;
  fromUsername?: string;
  text?: string;
  rawPayload: unknown;
}): void {
  db.prepare(
    `INSERT INTO ig_comments (id, connection_id, media_id, from_username, text, raw_payload)
     VALUES (@id, @connectionId, @mediaId, @fromUsername, @text, @rawPayload)
     ON CONFLICT(id) DO UPDATE SET
       connection_id = excluded.connection_id,
       media_id = excluded.media_id,
       from_username = excluded.from_username,
       text = excluded.text,
       raw_payload = excluded.raw_payload,
       updated_at = datetime('now')`
  ).run({
    id: data.id,
    connectionId: data.connectionId,
    mediaId: data.mediaId ?? null,
    fromUsername: data.fromUsername ?? null,
    text: data.text ?? null,
    rawPayload: JSON.stringify(data.rawPayload),
  });
}

export function listComments(connectionId: number): IgComment[] {
  return db
    .prepare(`SELECT * FROM ig_comments WHERE connection_id = ? ORDER BY created_at DESC`)
    .all(connectionId) as IgComment[];
}

export function getComment(connectionId: number, commentId: string): IgComment | undefined {
  return db
    .prepare(`SELECT * FROM ig_comments WHERE id = ? AND connection_id = ?`)
    .get(commentId, connectionId) as IgComment | undefined;
}

export function insertCommentReply(data: { commentId: string; replyCommentId?: string; text: string }): void {
  db.prepare(
    `INSERT INTO ig_comment_replies (comment_id, reply_comment_id, text) VALUES (@commentId, @replyCommentId, @text)`
  ).run({
    commentId: data.commentId,
    replyCommentId: data.replyCommentId ?? null,
    text: data.text,
  });
  db.prepare(`UPDATE ig_comments SET status = 'replied', updated_at = datetime('now') WHERE id = ?`).run(
    data.commentId
  );
}

export function insertPost(data: {
  connectionId: number;
  igMediaId?: string;
  containerId?: string;
  caption?: string;
  imageUrl: string;
  status: "published" | "failed";
  errorMessage?: string;
}): void {
  db.prepare(
    `INSERT INTO posts (connection_id, ig_media_id, container_id, caption, image_url, status, error_message)
     VALUES (@connectionId, @igMediaId, @containerId, @caption, @imageUrl, @status, @errorMessage)`
  ).run({
    connectionId: data.connectionId,
    igMediaId: data.igMediaId ?? null,
    containerId: data.containerId ?? null,
    caption: data.caption ?? null,
    imageUrl: data.imageUrl,
    status: data.status,
    errorMessage: data.errorMessage ?? null,
  });
}

export function listPosts(connectionId: number) {
  return db.prepare(`SELECT * FROM posts WHERE connection_id = ? ORDER BY id DESC`).all(connectionId);
}

export function insertStory(data: {
  connectionId: number;
  igMediaId?: string;
  containerId?: string;
  imageUrl: string;
  status: "published" | "failed";
  errorMessage?: string;
}): void {
  db.prepare(
    `INSERT INTO stories (connection_id, ig_media_id, container_id, image_url, status, error_message)
     VALUES (@connectionId, @igMediaId, @containerId, @imageUrl, @status, @errorMessage)`
  ).run({
    connectionId: data.connectionId,
    igMediaId: data.igMediaId ?? null,
    containerId: data.containerId ?? null,
    imageUrl: data.imageUrl,
    status: data.status,
    errorMessage: data.errorMessage ?? null,
  });
}

export function listStories(connectionId: number) {
  return db.prepare(`SELECT * FROM stories WHERE connection_id = ? ORDER BY id DESC`).all(connectionId);
}
