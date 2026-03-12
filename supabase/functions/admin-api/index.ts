import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyAdminToken } from "../_shared/admin-auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type TeamRow = {
  id: string;
  name: string;
  display_order: number | null;
};

type LeagueAssetRow = {
  asset_key: string;
  image_path: string | null;
};

const LEAGUE_ASSET_BUCKET = "league-assets";
const LEAGUE_ASSET_KEY = "match_order";
const LEAGUE_ASSET_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
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
      500,
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
      case "session_status":
        return jsonResponse({ message: "관리자 세션이 유효합니다." });
      case "add_team":
        return await handleAddTeam(supabase, body);
      case "remove_team":
        return await handleRemoveTeam(supabase, body);
      case "generate_matches":
        return await handleGenerateMatches(supabase);
      case "create_league_asset_upload":
        return await handleCreateLeagueAssetUpload(supabase, body);
      case "update_league_asset_image":
        return await handleUpdateLeagueAssetImage(supabase, body);
      case "remove_league_asset_image":
        return await handleRemoveLeagueAssetImage(supabase);
      case "cleanup_league_asset_image":
        return await handleCleanupLeagueAssetImage(supabase, body);
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
      400,
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
      400,
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
      400,
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

async function handleCreateLeagueAssetUpload(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "";

  if (!fileName || !contentType) {
    return jsonResponse({ error: "업로드할 이미지 정보가 부족합니다." }, 400);
  }

  if (!LEAGUE_ASSET_MIME_TYPES.has(contentType)) {
    return jsonResponse({ error: "지원하지 않는 이미지 형식입니다." }, 400);
  }

  const extension = getImageExtension(fileName, contentType);
  const path = `${LEAGUE_ASSET_KEY}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage
    .from(LEAGUE_ASSET_BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    throw new Error(error.message);
  }

  return jsonResponse({
    path: data.path,
    token: data.token,
  });
}

async function handleUpdateLeagueAssetImage(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const imagePath = typeof body.imagePath === "string" ? body.imagePath.trim() : "";

  if (!imagePath) {
    return jsonResponse({ error: "imagePath가 필요합니다." }, 400);
  }

  if (!imagePath.startsWith(`${LEAGUE_ASSET_KEY}/`)) {
    return jsonResponse({ error: "잘못된 대진 순서 이미지 경로입니다." }, 400);
  }

  const currentAsset = await getLeagueAssetRow(supabase);
  const { error } = await supabase.from("league_assets").upsert(
    {
      asset_key: LEAGUE_ASSET_KEY,
      image_path: imagePath,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "asset_key" },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (currentAsset?.image_path && currentAsset.image_path !== imagePath) {
    await removeStorageObjectIfPresent(supabase, currentAsset.image_path);
  }

  return jsonResponse({
    message: "대진 순서 이미지를 저장했습니다.",
  });
}

async function handleRemoveLeagueAssetImage(supabase: ReturnType<typeof createClient>) {
  const currentAsset = await getLeagueAssetRow(supabase);

  if (!currentAsset?.image_path) {
    return jsonResponse({ message: "삭제할 대진 순서 이미지가 없습니다." });
  }

  const { error } = await supabase.from("league_assets").upsert(
    {
      asset_key: LEAGUE_ASSET_KEY,
      image_path: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "asset_key" },
  );

  if (error) {
    throw new Error(error.message);
  }

  await removeStorageObjectIfPresent(supabase, currentAsset.image_path);

  return jsonResponse({
    message: "대진 순서 이미지를 삭제했습니다.",
  });
}

async function handleCleanupLeagueAssetImage(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const imagePath = typeof body.imagePath === "string" ? body.imagePath.trim() : "";

  if (!imagePath) {
    return jsonResponse({ message: "정리할 대진 순서 이미지가 없습니다." });
  }

  await removeStorageObjectIfPresent(supabase, imagePath);

  return jsonResponse({
    message: "업로드된 대진 순서 이미지를 정리했습니다.",
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
  const currentAsset = await getLeagueAssetRow(supabase);
  await removeStorageObjectIfPresent(supabase, currentAsset?.image_path || null);

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

  const { error: assetError } = await supabase
    .from("league_assets")
    .delete()
    .eq("asset_key", LEAGUE_ASSET_KEY);

  if (assetError) {
    throw new Error(assetError.message);
  }

  return jsonResponse({
    message: "모든 데이터를 초기화했습니다. 빈 상태에서 다시 시작할 수 있습니다.",
  });
}

async function getLeagueAssetRow(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("league_assets")
    .select("asset_key, image_path")
    .eq("asset_key", LEAGUE_ASSET_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as LeagueAssetRow | null) || null;
}

async function removeStorageObjectIfPresent(
  supabase: ReturnType<typeof createClient>,
  imagePath: string | null,
) {
  if (!imagePath) {
    return;
  }

  const { error } = await supabase.storage.from(LEAGUE_ASSET_BUCKET).remove([imagePath]);

  if (error) {
    throw new Error(error.message);
  }
}

function getImageExtension(fileName: string, contentType: string) {
  const sanitizedFileName = fileName.replaceAll(/[^a-zA-Z0-9._-]/g, "").toLowerCase();
  const fileNameParts = sanitizedFileName.split(".");
  const fileExtension = fileNameParts.length > 1 ? fileNameParts.at(-1) || "" : "";
  const mappedExtension = MIME_EXTENSION_MAP[contentType] || "";

  if (fileExtension && fileExtension === mappedExtension) {
    return fileExtension;
  }

  return mappedExtension || "jpg";
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
