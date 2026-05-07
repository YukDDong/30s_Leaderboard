import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export const LEAGUE_ASSET_BUCKET = "league-assets";
export const LEAGUE_ASSET_KEY = "match_order";
const LEAGUE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const LEAGUE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const LEAGUE_REALTIME_TABLES = ["teams", "matches", "league_assets"];

let supabaseClient = null;

export function getAppConfig() {
  const config = window.__APP_CONFIG__ || {};

  return {
    supabaseUrl: typeof config.supabaseUrl === "string" ? config.supabaseUrl.trim() : "",
    supabaseAnonKey:
      typeof config.supabaseAnonKey === "string" ? config.supabaseAnonKey.trim() : "",
  };
}

export function getMissingConfigKeys() {
  const { supabaseUrl, supabaseAnonKey } = getAppConfig();
  const missing = [];

  if (!supabaseUrl) {
    missing.push("supabaseUrl");
  }

  if (!supabaseAnonKey) {
    missing.push("supabaseAnonKey");
  }

  return missing;
}

export function isSupabaseConfigured() {
  return getMissingConfigKeys().length === 0;
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw createClientError(
      "Supabase 설정이 비어 있습니다. config.js에 supabaseUrl과 supabaseAnonKey를 입력해 주세요."
    );
  }

  if (!supabaseClient) {
    const { supabaseUrl, supabaseAnonKey } = getAppConfig();
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseClient;
}

export async function fetchTeams() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, display_order, created_at")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw createClientError(error.message, error.code);
  }

  return data || [];
}

export async function fetchMatches() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id, score_a, score_b, is_played, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw createClientError(error.message, error.code);
  }

  return data || [];
}

export async function fetchLeagueAsset() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("league_assets")
    .select("asset_key, image_path, updated_at")
    .eq("asset_key", LEAGUE_ASSET_KEY)
    .maybeSingle();

  if (error) {
    throw createClientError(error.message, error.code);
  }

  return {
    assetKey: data?.asset_key || LEAGUE_ASSET_KEY,
    imagePath: typeof data?.image_path === "string" ? data.image_path : "",
    imageUrl: getLeagueAssetPublicUrl(data?.image_path),
    updatedAt: data?.updated_at || null,
  };
}

export async function fetchLeagueData() {
  const [teams, matches, leagueAsset] = await Promise.all([
    fetchTeams(),
    fetchMatches(),
    fetchLeagueAsset(),
  ]);
  return { teams, matches, leagueAsset };
}

export function subscribeToLeagueRealtime(onChange) {
  if (typeof onChange !== "function") {
    throw createClientError("실시간 구독 콜백이 필요합니다.");
  }

  const supabase = getSupabaseClient();
  const channel = supabase.channel(`league-live-${crypto.randomUUID()}`);

  LEAGUE_REALTIME_TABLES.forEach((table) => {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
      },
      onChange
    );
  });

  void channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function verifyAdminPassword(password) {
  return callFunction("verify-admin-password", { password });
}

export async function callAdminFunction(action, payload, adminToken) {
  return callFunction(
    "admin-api",
    {
      action,
      ...payload,
    },
    adminToken
  );
}

export function validateLeagueImageFile(file) {
  if (!(file instanceof File)) {
    return "이미지 파일을 선택해 주세요.";
  }

  if (!LEAGUE_IMAGE_MIME_TYPES.includes(file.type)) {
    return "JPG, PNG, WEBP, GIF 형식의 이미지만 업로드할 수 있습니다.";
  }

  if (file.size > LEAGUE_IMAGE_MAX_BYTES) {
    return "이미지 파일 크기는 5MB 이하여야 합니다.";
  }

  return "";
}

export async function uploadLeagueAssetImage(file, adminToken) {
  const validationMessage = validateLeagueImageFile(file);

  if (validationMessage) {
    throw createClientError(validationMessage);
  }

  const response = await callAdminFunction(
    "create_league_asset_upload",
    {
      fileName: file.name,
      contentType: file.type,
    },
    adminToken
  );

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage
    .from(LEAGUE_ASSET_BUCKET)
    .uploadToSignedUrl(response.path, response.token, file, {
      contentType: file.type,
    });

  if (error) {
    throw createClientError(error.message, error.code);
  }

  return {
    path: response.path,
    publicUrl: getLeagueAssetPublicUrl(response.path),
  };
}

export async function cleanupUploadedLeagueAssetImage(imagePath, adminToken) {
  if (!imagePath) {
    return;
  }

  await callAdminFunction(
    "cleanup_league_asset_image",
    {
      imagePath,
    },
    adminToken
  );
}

export function getLeagueAssetPublicUrl(imagePath) {
  if (!imagePath) {
    return "";
  }

  const { data } = getSupabaseClient().storage.from(LEAGUE_ASSET_BUCKET).getPublicUrl(imagePath);
  return data?.publicUrl || "";
}

async function callFunction(functionName, payload, adminToken = "") {
  if (!isSupabaseConfigured()) {
    throw createClientError(
      "Supabase 설정이 비어 있습니다. config.js에 supabaseUrl과 supabaseAnonKey를 입력해 주세요."
    );
  }

  const { supabaseUrl, supabaseAnonKey } = getAppConfig();
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      ...(adminToken ? { "x-admin-token": adminToken } : {}),
    },
    body: JSON.stringify(payload || {}),
  });

  const data = await parseFunctionResponse(response);

  if (!response.ok) {
    const error = createClientError(
      data?.error || data?.message || "요청 처리 중 오류가 발생했습니다.",
      data?.code || String(response.status)
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

async function parseFunctionResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    return { error: text || "응답 본문이 비어 있습니다." };
  }
}

function createClientError(message, code = "") {
  const error = new Error(message);
  error.code = code;
  return error;
}
