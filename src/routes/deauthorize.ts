import { Router } from "express";
import { verifySignedRequest } from "../instagram/signedRequest.js";
import { markConnectionRevoked } from "../db.js";

export const deauthorizeRouter = Router();

// Dipanggil Meta ketika user mencabut akses app dari sisi Instagram/Meta.
// Body: application/x-www-form-urlencoded dengan field `signed_request`.
deauthorizeRouter.post("/instagram/deauthorize", async (req, res) => {
  const signedRequest = req.body?.signed_request as string | undefined;
  if (!signedRequest) {
    res.sendStatus(400);
    return;
  }

  const payload = verifySignedRequest(signedRequest);
  if (!payload || !payload.user_id) {
    console.warn("Deauthorize callback: signed_request tidak valid.");
    res.sendStatus(403);
    return;
  }

  await markConnectionRevoked(payload.user_id);
  console.log(`Instagram user ${payload.user_id} mencabut akses app, connection ditandai revoked.`);

  res.sendStatus(200);
});
