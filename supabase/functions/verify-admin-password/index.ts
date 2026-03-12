import { constantTimeCompare, issueAdminToken } from "../_shared/admin-auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const SESSION_DURATION_SECONDS = 60 * 60 * 24;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "허용되지 않은 메서드입니다." }, 405);
  }

  const adminPassword = Deno.env.get("ADMIN_PASSWORD");
  const tokenSecret = Deno.env.get("ADMIN_TOKEN_SECRET");

  if (!adminPassword || !tokenSecret) {
    return jsonResponse(
      { error: "서버측 secret이 설정되지 않았습니다. ADMIN_PASSWORD와 ADMIN_TOKEN_SECRET을 확인해 주세요." },
      500
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (!password) {
    return jsonResponse({ error: "비밀번호를 입력해 주세요." }, 400);
  }

  if (!constantTimeCompare(password, adminPassword)) {
    return jsonResponse({ error: "비밀번호가 올바르지 않습니다." }, 401);
  }

  const session = await issueAdminToken(tokenSecret, SESSION_DURATION_SECONDS);

  return jsonResponse({
    token: session.token,
    expiresAt: session.expiresAt,
    message: "관리자 인증에 성공했습니다.",
  });
});
