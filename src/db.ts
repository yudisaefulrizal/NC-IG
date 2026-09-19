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

// Prototipe single-user: ambil satu koneksi aktif yang paling baru.
export function getActiveConnection(): Connection | undefined {
  return db
    .prepare(`SELECT * FROM connections WHERE status = 'active' ORDER BY id DESC LIMIT 1`)
    .get() as Connection | undefined;
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
