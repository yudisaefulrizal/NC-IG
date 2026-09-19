// Wrapper tipis untuk Instagram Messaging API (kirim pesan).
// Referensi resmi:
// https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/
// Endpoint & auth berbeda dari publish.ts/client.ts (graph.instagram.com
// yang sama, tapi access_token di header Authorization, bukan query string).
const GRAPH_BASE = "https://graph.instagram.com/v23.0";

interface SendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export async function sendTextMessage(params: {
  igUserId: string;
  accessToken: string;
  recipientId: string;
  text: string;
}): Promise<SendMessageResponse> {
  const res = await fetch(`${GRAPH_BASE}/${params.igUserId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: params.recipientId },
      message: { text: params.text },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gagal mengirim pesan Instagram (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as SendMessageResponse;
}
