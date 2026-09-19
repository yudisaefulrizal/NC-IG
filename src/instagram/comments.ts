// Wrapper tipis untuk Instagram Comments API (Comment Moderation).
// Referensi resmi:
// https://developers.facebook.com/documentation/instagram-platform/comment-moderation
const GRAPH_BASE = "https://graph.instagram.com/v23.0";

interface ReplyResponse {
  id: string;
}

// Reply hanya berlaku untuk komentar tingkat atas (batasan API Meta sendiri,
// bukan batasan kode ini) — sesuai keputusan scope, nested reply tidak
// didukung.
export async function replyToComment(params: {
  commentId: string;
  accessToken: string;
  message: string;
}): Promise<ReplyResponse> {
  const res = await fetch(`${GRAPH_BASE}/${params.commentId}/replies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: params.message }),
  });

  if (!res.ok) {
    throw new Error(`Gagal membalas komentar Instagram (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as ReplyResponse;
}
