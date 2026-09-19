import express from "express";
import path from "node:path";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { webhookRouter } from "./routes/webhook.js";
import { deauthorizeRouter } from "./routes/deauthorize.js";
import { dataDeletionRouter, dataDeletionStatusRouter } from "./routes/dataDeletion.js";
import { connectionRouter } from "./routes/connection.js";

const app = express();

// Simpan raw body HANYA untuk request ke webhook, karena X-Hub-Signature-256
// dihitung Meta atas byte mentah sebelum JSON parsing. Route lain pakai
// express.json() biasa.
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

app.use(express.static(path.join(process.cwd(), "src/public")));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/webhook", webhookRouter);
app.use("/webhook", deauthorizeRouter);
app.use("/webhook", dataDeletionRouter);
app.use("/api/connection", connectionRouter);
app.use("/", dataDeletionStatusRouter);

app.listen(config.port, config.host, () => {
  console.log(`NC-IG berjalan di http://${config.host}:${config.port}`);
});
