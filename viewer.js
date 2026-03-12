import {
  clearMessage,
  normalizeLeagueData,
  renderMatches,
  renderStandings,
  renderSummary,
  setMessage,
} from "./app.js";
import {
  fetchLeagueData,
  getMissingConfigKeys,
  isSupabaseConfigured,
} from "./supabase-client.js";

const state = {
  teams: [],
  matches: [],
  leagueAsset: null,
};

const elements = {
  configNotice: document.getElementById("configNotice"),
  configNoticeMessage: document.getElementById("configNoticeMessage"),
  summaryCards: document.getElementById("summaryCards"),
  matchesContainer: document.getElementById("matchesContainer"),
  matchesMessage: document.getElementById("matchesMessage"),
  leagueImage: document.getElementById("leagueImage"),
  leagueImageEmpty: document.getElementById("leagueImageEmpty"),
  standingsBody: document.getElementById("standingsBody"),
};

initializeViewerPage();

async function initializeViewerPage() {
  if (!isSupabaseConfigured()) {
    const missingKeys = getMissingConfigKeys().join(", ");
    elements.configNotice.hidden = false;
    setMessage(
      elements.configNoticeMessage,
      `Supabase 설정이 비어 있습니다. config.js의 ${missingKeys} 값을 채운 뒤 다시 새로고침해 주세요.`,
      "warning"
    );
    renderPage();
    return;
  }

  setMessage(elements.matchesMessage, "Supabase에서 최신 리그 데이터를 불러오는 중입니다.", "warning");

  try {
    const { teams, matches, leagueAsset } = await fetchLeagueData();
    const normalized = normalizeLeagueData(teams, matches);
    state.teams = normalized.teams;
    state.matches = normalized.matches;
    state.leagueAsset = leagueAsset;
    renderPage();
    clearMessage(elements.matchesMessage);
  } catch (error) {
    renderPage();
    setMessage(
      elements.matchesMessage,
      error.message || "리그 데이터를 불러오지 못했습니다. Supabase 설정과 네트워크 상태를 확인해 주세요.",
      "danger"
    );
  }
}

function renderPage() {
  renderSummary(elements.summaryCards, state.teams, state.matches);
  renderMatches(elements.matchesContainer, state.teams, state.matches, {
    editable: false,
    pendingLabel: "-",
  });
  renderLeagueImage();
  renderStandings(elements.standingsBody, state.teams, state.matches);
}

function renderLeagueImage() {
  const imageUrl = state.leagueAsset?.imageUrl || "";

  elements.leagueImage.hidden = !imageUrl;
  elements.leagueImageEmpty.hidden = Boolean(imageUrl);

  if (!imageUrl) {
    elements.leagueImage.removeAttribute("src");
    return;
  }

  elements.leagueImage.src = imageUrl;
}
