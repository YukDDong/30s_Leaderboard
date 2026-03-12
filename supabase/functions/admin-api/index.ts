import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyAdminToken } from "../_shared/admin-auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type TeamRow = {
  id: string;
  name: string;
  display_order: number | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "허용되지 않은 메서드입니다." }, 405);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const tokenSecret = Deno.env.get("ADMIN_TOKEN_SECRET");

  if (!serviceRoleKey || !supabaseUrl || !tokenSecret) {
    return jsonResponse(
      { error: "Edge Function 환경변수가 부족합니다. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN_SECRET을 확인해 주세요." },
      500
    );
  }

  const adminToken = request.headers.get("x-admin-token") || "";

  try {
    await verifyAdminToken(adminToken, tokenSecret);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "관리자 인증에 실패했습니다." }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    switch (action) {
      case "add_team":
        return await handleAddTeam(supabase, body);
      case "remove_team":
        return await handleRemoveTeam(supabase, body);
      case "generate_matches":
        return await handleGenerateMatches(supabase);
      case "update_match":
        return await handleUpdateMatch(supabase, body);
      case "clear_match":
        return await handleClearMatch(supabase, body);
      case "reset_data":
        return await handleResetData(supabase);
      default:
        return jsonResponse({ error: "지원하지 않는 action입니다." }, 400);
    }
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "관리자 요청 처리 중 오류가 발생했습니다." },
      400
    );
  }
});

async function handleAddTeam(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return jsonResponse({ error: "팀명을 입력해 주세요." }, 400);
  }

  const { count: matchCount, error: matchCountError } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true });

  if (matchCountError) {
    throw new Error(matchCountError.message);
  }

  if ((matchCount || 0) > 0) {
    return jsonResponse(
      { error: "경기 일정이 이미 생성되어 팀 추가가 잠겨 있습니다. 전체 초기화 후 다시 시작해 주세요." },
      400
    );
  }

  const { data: lastTeam, error: lastTeamError } = await supabase
    .from("teams")
    .select("display_order")
    .order("display_order", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (lastTeamError) {
    throw new Error(lastTeamError.message);
  }

  const nextDisplayOrder =
    typeof lastTeam?.display_order === "number" ? lastTeam.display_order + 1 : 0;

  const { error } = await supabase.from("teams").insert({
    name,
    display_order: nextDisplayOrder,
  });

  if (error) {
    throw new Error(error.message);
  }

  return jsonResponse({
    message: `팀 "${name}"을(를) 추가했습니다.`,
  });
}

async function handleRemoveTeam(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const teamId = typeof body.teamId === "string" ? body.teamId : "";

  if (!teamId) {
    return jsonResponse({ error: "teamId가 필요합니다." }, 400);
  }

  const { count: matchCount, error: matchCountError } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true });

  if (matchCountError) {
    throw new Error(matchCountError.message);
  }

  if ((matchCount || 0) > 0) {
    return jsonResponse(
      { error: "경기 일정이 이미 생성되어 팀 삭제가 잠겨 있습니다. 전체 초기화 후 다시 시작해 주세요." },
      400
    );
  }

  const { error } = await supabase.from("teams").delete().eq("id", teamId);

  if (error) {
    throw new Error(error.message);
  }

  return jsonResponse({
    message: "팀을 삭제했습니다.",
  });
}

async function handleGenerateMatches(supabase: ReturnType<typeof createClient>) {
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, display_order")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const teamRows = (teams || []) as TeamRow[];

  if (teamRows.length < 2) {
    return jsonResponse({ error: "경기를 생성하려면 팀이 2개 이상 필요합니다." }, 400);
  }

  const { count: existingMatches, error: matchCountError } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true });

  if (matchCountError) {
    throw new Error(matchCountError.message);
  }

  if ((existingMatches || 0) > 0) {
    return jsonResponse({ error: "이미 경기 일정이 생성되어 있습니다." }, 400);
  }

  const inserts: Array<{ team_a_id: string; team_b_id: string }> = [];

  for (let teamAIndex = 0; teamAIndex < teamRows.length; teamAIndex += 1) {
    for (let teamBIndex = teamAIndex + 1; teamBIndex < teamRows.length; teamBIndex += 1) {
      inserts.push({
        team_a_id: teamRows[teamAIndex].id,
        team_b_id: teamRows[teamBIndex].id,
      });
    }
  }

  const { error } = await supabase.from("matches").insert(inserts);

  if (error) {
    throw new Error(error.message);
  }

  return jsonResponse({
    message: `총 ${inserts.length}경기의 단일 풀리그 일정이 생성되었습니다. 이제 경기 표에서 원하는 경기를 눌러 점수를 입력해 주세요.`,
  });
}

async function handleUpdateMatch(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const matchId = typeof body.matchId === "string" ? body.matchId : "";
  const scoreA = parseNonNegativeInteger(body.scoreA);
  const scoreB = parseNonNegativeInteger(body.scoreB);

  if (!matchId) {
    return jsonResponse({ error: "matchId가 필요합니다." }, 400);
  }

  if (scoreA === null || scoreB === null) {
    return jsonResponse({ error: "점수는 0 이상의 정수만 저장할 수 있습니다." }, 400);
  }

  const { error } = await supabase
    .from("matches")
    .update({
      score_a: scoreA,
      score_b: scoreB,
      is_played: true,
    })
    .eq("id", matchId);

  if (error) {
    throw new Error(error.message);
  }

  return jsonResponse({
    message: "경기 결과를 저장했습니다. 순위표가 즉시 갱신되었습니다.",
  });
}

async function handleClearMatch(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const matchId = typeof body.matchId === "string" ? body.matchId : "";

  if (!matchId) {
    return jsonResponse({ error: "matchId가 필요합니다." }, 400);
  }

  const { error } = await supabase
    .from("matches")
    .update({
      score_a: null,
      score_b: null,
      is_played: false,
    })
    .eq("id", matchId);

  if (error) {
    throw new Error(error.message);
  }

  return jsonResponse({
    message: "경기 결과를 초기화했습니다. 순위표를 다시 계산했습니다.",
  });
}

async function handleResetData(supabase: ReturnType<typeof createClient>) {
  const { error: matchesError } = await supabase
    .from("matches")
    .delete()
    .gte("created_at", "1970-01-01T00:00:00Z");

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const { error: teamsError } = await supabase
    .from("teams")
    .delete()
    .gte("created_at", "1970-01-01T00:00:00Z");

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  return jsonResponse({
    message: "모든 데이터를 초기화했습니다. 빈 상태에서 다시 시작할 수 있습니다.",
  });
}

function parseNonNegativeInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return null;
}
