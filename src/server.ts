import express from "express";
import path from "node:path";
import { config } from "./config.js";
import { authRouter, authCallbackRouter } from "./routes/auth.js";
import { webhookRouter } from "./routes/webhook.js";
import { deauthorizeRouter } from "./routes/deauthorize.js";
import { dataDeletionRouter, dataDeletionStatusRouter } from "./routes/dataDeletion.js";
import { connectionRouter } from "./routes/connection.js";
import { messagesRouter } from "./routes/messages.js";
import { commentsRouter } from "./routes/comments.js";
import { postsRouter } from "./routes/posts.js";
import { storiesRouter } from "./routes/stories.js";
import { sessionRouter } from "./routes/session.js";
import { requireAuth } from "./middleware/requireAuth.js";

const app = express();
const publicDir = path.join(process.cwd(), "src/public");

// Simpan raw body HANYA untuk request ke webhook, karena X-Hub-Signature-256
// dihitung Meta atas byte mentah sebelum JSON parsing. Route lain pakai
// express.json() biasa. Urutan ini TIDAK BOLEH digeser oleh middleware auth
// di bawah — raw body harus ditangkap sebelum body parser lain menyentuhnya.
app.use(
  "/webhook",
  express.json({
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: Buffer }).rawBody = buf;
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // untuk signed_request (form-encoded)

// --- Publik, TANPA login (diakses server Meta atau sebelum operator login) ---

// sample.jpg dipakai sebagai image_url saat publish — server Meta yang
// mengunduhnya, jadi WAJIB tetap bisa diakses tanpa cookie.
app.get("/sample.jpg", (_req, res) => res.sendFile(path.join(publicDir, "sample.jpg")));
app.get("/login.html", (_req, res) => res.sendFile(path.join(publicDir, "login.html")));
// style.css & logo.png dipakai juga oleh login.html, jadi harus ikut publik.
app.get("/style.css", (_req, res) => res.sendFile(path.join(publicDir, "style.css")));
app.get("/logo.png", (_req, res) => res.sendFile(path.join(publicDir, "logo.png")));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/webhook", webhookRouter);
app.use("/webhook", deauthorizeRouter);
app.use("/webhook", dataDeletionRouter);
app.use("/", dataDeletionStatusRouter);

// Callback OAuth dipanggil via redirect browser dari Meta, bukan dari
// konteks session operator — harus tetap terbuka. GET /auth/instagram
// (mulai flow) TIDAK ada di router ini, itu ikut diproteksi lewat authRouter
// di bawah requireAuth.
app.use("/auth", authCallbackRouter);

app.use("/session", sessionRouter);

// --- Mulai dari sini, semua route wajib login ---
app.use(requireAuth);

app.use("/auth", authRouter);
app.use("/api/connection", connectionRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/posts", postsRouter);
app.use("/api/stories", storiesRouter);
app.use(express.static(publicDir));

app.listen(config.port, config.host, () => {
  console.log(`NC-IG berjalan di http://${config.host}:${config.port}`);
});
