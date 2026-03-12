import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

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

export async function fetchLeagueData() {
  const [teams, matches] = await Promise.all([fetchTeams(), fetchMatches()]);
  return { teams, matches };
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
