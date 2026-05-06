import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../style.css";
import {
  ConfigNotice,
  MatchesMatrix,
  Message,
  StandingsTable,
  SummaryCards,
  TeamsList,
} from "./components.jsx";
import {
  findMatchById,
  formatFileSize,
  formatScoreValue,
  normalizeLeagueData,
  normalizeScore,
} from "./league.js";
import {
  callAdminFunction,
  cleanupUploadedLeagueAssetImage,
  fetchLeagueData,
  getMissingConfigKeys,
  isSupabaseConfigured,
  subscribeToLeagueRealtime,
  uploadLeagueAssetImage,
  validateLeagueImageFile,
  verifyAdminPassword,
} from "./supabaseClient.js";

const SESSION_KEYS = {
  token: "admin_session_token",
  expiresAt: "admin_session_expires_at",
};
const REALTIME_REFRESH_DEBOUNCE_MS = 500;
const emptyLeagueState = { teams: [], matches: [], leagueAsset: null };
const emptyMessages = {
  adminStatus: { text: "", tone: "warning" },
  auth: { text: "", tone: "warning" },
  config: { text: "", tone: "warning" },
  leagueImage: { text: "", tone: "warning" },
  matchGeneration: { text: "", tone: "warning" },
  matches: { text: "", tone: "warning" },
  modal: { text: "", tone: "warning" },
  reset: { text: "", tone: "warning" },
  team: { text: "", tone: "warning" },
};

function AdminPage() {
  const [league, setLeague] = useState(emptyLeagueState);
  const [messages, setMessages] = useState(emptyMessages);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedLeagueImage, setSelectedLeagueImage] = useState(null);
  const [leagueImagePreviewUrl, setLeagueImagePreviewUrl] = useState("");
  const [modalScores, setModalScores] = useState({ scoreA: "", scoreB: "" });
  const isHydratingRef = useRef(false);
  const pendingRealtimeRefreshRef = useRef(false);
  const refreshDebounceIdRef = useRef(null);
  const loadingRef = useRef(false);
  const isModalOpenRef = useRef(false);
  const isUnlockedRef = useRef(false);
  const modalScoreARef = useRef(null);

  const selectedMatch = selectedMatchId ? findMatchById(league.matches, selectedMatchId) : null;
  const isModalOpen = Boolean(selectedMatchId);
  const isLocked = !isUnlocked || !isAdminSessionValid();
  const configMissing = !isSupabaseConfigured();
  const matchesExist = league.matches.length > 0;

  function setMessage(key, text, tone = "warning") {
    setMessages((current) => ({
      ...current,
      [key]: { text, tone },
    }));
  }

  function clearMessage(key) {
    setMessage(key, "", "warning");
  }

  function clearMessages(keys) {
    setMessages((current) => {
      const next = { ...current };
      keys.forEach((key) => {
        next[key] = { text: "", tone: "warning" };
      });
      return next;
    });
  }

  function loadAdminSession() {
    return {
      token: localStorage.getItem(SESSION_KEYS.token) || "",
      expiresAt: localStorage.getItem(SESSION_KEYS.expiresAt) || "",
    };
  }

  function saveAdminSession(token, expiresAt) {
    localStorage.setItem(SESSION_KEYS.token, token);
    localStorage.setItem(SESSION_KEYS.expiresAt, expiresAt);
  }

  function clearAdminSession() {
    localStorage.removeItem(SESSION_KEYS.token);
    localStorage.removeItem(SESSION_KEYS.expiresAt);
  }

  function isAdminSessionValid() {
    const session = {
      token: localStorage.getItem(SESSION_KEYS.token) || "",
      expiresAt: localStorage.getItem(SESSION_KEYS.expiresAt) || "",
    };

    if (!session.token || !session.expiresAt) {
      return false;
    }

    const expiresAtTime = Date.parse(session.expiresAt);

    if (Number.isNaN(expiresAtTime) || expiresAtTime <= Date.now()) {
      clearAdminSession();
      return false;
    }

    return true;
  }

  function expireAdminSession(message) {
    clearAdminSession();
    setIsUnlocked(false);
    setSelectedMatchId("");
    setMessage("auth", message, "warning");
  }

  async function hydrateAdminPage(statusMessage = "", { showBusy = true } = {}) {
    if (isHydratingRef.current) {
      pendingRealtimeRefreshRef.current = true;
      return;
    }

    isHydratingRef.current = true;

    if (showBusy) {
      setLoading(true);
      setMessage("adminStatus", "Supabase에서 최신 리그 데이터를 불러오는 중입니다.", "warning");
    }

    try {
      const { teams, matches, leagueAsset } = await fetchLeagueData();
      const normalized = normalizeLeagueData(teams, matches);
      setLeague({
        teams: normalized.teams,
        matches: normalized.matches,
        leagueAsset,
      });
      pendingRealtimeRefreshRef.current = false;

      if (selectedMatchId && !findMatchById(normalized.matches, selectedMatchId)) {
        setSelectedMatchId("");
      }

      if (statusMessage) {
        setMessage("adminStatus", statusMessage, "success");
      } else if (showBusy) {
        clearMessage("adminStatus");
      }
    } catch (error) {
      setMessage(
        "adminStatus",
        error.message || "리그 데이터를 불러오지 못했습니다. Supabase 설정과 네트워크 상태를 확인해 주세요.",
        "danger"
      );
    } finally {
      if (showBusy) {
        setLoading(false);
      }

      isHydratingRef.current = false;

      if (pendingRealtimeRefreshRef.current && !loadingRef.current && !isModalOpenRef.current) {
        pendingRealtimeRefreshRef.current = false;
        void hydrateAdminPage("", { showBusy: false });
      }
    }
  }

  async function restoreAdminSession() {
    setIsUnlocked(false);
    setLoading(true);
    setMessage("auth", "이전 관리자 세션을 확인하는 중입니다.", "warning");

    try {
      const session = loadAdminSession();
      await callAdminFunction("session_status", {}, session.token);
      setIsUnlocked(true);
      clearMessage("auth");
      await hydrateAdminPage("이전 관리자 세션을 복원했습니다.");
    } catch (error) {
      expireAdminSession("관리자 세션이 만료되었거나 유효하지 않습니다. 다시 비밀번호를 입력해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function runAdminAction(action, payload = {}) {
    if (!isAdminSessionValid()) {
      expireAdminSession("관리자 세션이 만료되었습니다. 다시 비밀번호를 입력해 주세요.");
      return { ok: false, tone: "warning", message: "관리자 세션이 만료되었습니다." };
    }

    setLoading(true);
    setMessage("adminStatus", "관리자 요청을 처리하는 중입니다.", "warning");

    try {
      const session = loadAdminSession();
      const response = await callAdminFunction(action, payload, session.token);
      await hydrateAdminPage(response.message || "");
      return { ok: true, ...response, tone: "success" };
    } catch (error) {
      if (error.status === 401) {
        expireAdminSession("관리자 세션이 만료되었거나 유효하지 않습니다. 다시 인증해 주세요.");
        return {
          ok: false,
          tone: "warning",
          message: "관리자 세션이 만료되었거나 유효하지 않습니다.",
        };
      }

      return {
        ok: false,
        tone: "danger",
        message: error.message || "관리자 요청 처리 중 오류가 발생했습니다.",
      };
    } finally {
      setLoading(false);
    }
  }

  function scheduleRealtimeRefresh() {
    if (!isUnlockedRef.current || !isAdminSessionValid()) {
      return;
    }

    if (loadingRef.current || isModalOpenRef.current) {
      pendingRealtimeRefreshRef.current = true;
      return;
    }

    if (refreshDebounceIdRef.current) {
      window.clearTimeout(refreshDebounceIdRef.current);
    }

    refreshDebounceIdRef.current = window.setTimeout(() => {
      refreshDebounceIdRef.current = null;
      void hydrateAdminPage("", { showBusy: false });
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "").trim();

    if (!password) {
      setMessage("auth", "비밀번호를 입력해 주세요.", "danger");
      return;
    }

    setLoading(true);
    setMessage("auth", "관리자 비밀번호를 검증하는 중입니다.", "warning");

    try {
      const result = await verifyAdminPassword(password);
      saveAdminSession(result.token, result.expiresAt);
      event.currentTarget.reset();
      setIsUnlocked(true);
      setMessage("auth", "인증에 성공했습니다.", "success");
      await hydrateAdminPage("관리자 세션이 열렸습니다.");
    } catch (error) {
      setMessage(
        "auth",
        error.message || "비밀번호 검증에 실패했습니다. Edge Function 설정을 확인해 주세요.",
        "danger"
      );
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearAdminSession();
    setSelectedMatchId("");
    setSelectedLeagueImage(null);
    clearMessage("adminStatus");
    setMessage("auth", "로그아웃되었습니다. 다시 비밀번호를 입력해 주세요.", "warning");
    setIsUnlocked(false);
  }

  function handleLeagueImageChange(event) {
    const file = event.target.files?.[0] || null;
    clearMessage("leagueImage");

    if (!file) {
      setSelectedLeagueImage(null);
      return;
    }

    const validationMessage = validateLeagueImageFile(file);

    if (validationMessage) {
      event.target.value = "";
      setSelectedLeagueImage(null);
      setMessage("leagueImage", validationMessage, "danger");
      return;
    }

    setSelectedLeagueImage(file);
  }

  async function handleLeagueImageSave(event) {
    event.preventDefault();
    clearMessages(["reset", "leagueImage"]);

    if (!selectedLeagueImage) {
      setMessage("leagueImage", "업로드할 이미지를 먼저 선택해 주세요.", "warning");
      return;
    }

    const validationMessage = validateLeagueImageFile(selectedLeagueImage);

    if (validationMessage) {
      setMessage("leagueImage", validationMessage, "danger");
      return;
    }

    const session = loadAdminSession();
    const previousImagePath = league.leagueAsset?.imagePath || "";
    let uploadedImagePath = "";

    try {
      const uploadedImage = await uploadLeagueAssetImage(selectedLeagueImage, session.token);
      uploadedImagePath = uploadedImage.path;
    } catch (error) {
      setMessage(
        "leagueImage",
        error.message || "대진 순서 이미지 업로드 중 오류가 발생했습니다.",
        "danger"
      );
      return;
    }

    const result = await runAdminAction("update_league_asset_image", {
      imagePath: uploadedImagePath,
    });

    if (!result.ok) {
      if (uploadedImagePath && uploadedImagePath !== previousImagePath) {
        void cleanupUploadedLeagueAssetImage(uploadedImagePath, session.token).catch(() => {});
      }

      setMessage(
        "leagueImage",
        result.message || "대진 순서 이미지 저장 중 오류가 발생했습니다.",
        result.tone || "danger"
      );
      return;
    }

    event.currentTarget.reset();
    setSelectedLeagueImage(null);
    setMessage("leagueImage", result.message || "대진 순서 이미지를 저장했습니다.", "success");
  }

  async function handleRemoveLeagueImage() {
    clearMessages(["reset", "leagueImage"]);

    if (!league.leagueAsset?.imagePath) {
      setMessage("leagueImage", "삭제할 대진 순서 이미지가 없습니다.", "warning");
      return;
    }

    const result = await runAdminAction("remove_league_asset_image");

    if (!result.ok) {
      setMessage(
        "leagueImage",
        result.message || "대진 순서 이미지 삭제 중 오류가 발생했습니다.",
        result.tone || "danger"
      );
      return;
    }

    setSelectedLeagueImage(null);
    setMessage("leagueImage", result.message || "대진 순서 이미지를 삭제했습니다.", "success");
  }

  async function handleAddTeam(event) {
    event.preventDefault();
    clearMessages(["reset", "matchGeneration", "matches"]);

    const formData = new FormData(event.currentTarget);
    const teamName = String(formData.get("teamName") || "").trim();

    if (!teamName) {
      setMessage("team", "팀명을 입력해 주세요.", "danger");
      return;
    }

    const result = await runAdminAction("add_team", { name: teamName });

    if (!result.ok) {
      setMessage("team", result.message || "팀 추가 중 오류가 발생했습니다.", result.tone || "danger");
      return;
    }

    event.currentTarget.reset();
    event.currentTarget.elements.teamName?.focus();
    setMessage("team", result.message || `팀 "${teamName}"을(를) 추가했습니다.`, "success");
  }

  async function handleRemoveTeam(team) {
    if (league.matches.length > 0) {
      setMessage(
        "team",
        "경기 일정이 이미 생성되어 팀 삭제가 잠겨 있습니다. 전체 초기화 후 다시 시작해 주세요.",
        "warning"
      );
      return;
    }

    const result = await runAdminAction("remove_team", { teamId: team.id });

    if (!result.ok) {
      setMessage("team", result.message || "팀 삭제 중 오류가 발생했습니다.", result.tone || "danger");
      return;
    }

    setMessage("team", result.message || `팀 "${team.name}"을(를) 삭제했습니다.`, "success");
  }

  async function handleGenerateMatches() {
    clearMessages(["team", "reset", "matches"]);

    if (league.teams.length < 2) {
      setMessage("matchGeneration", "경기를 생성하려면 팀이 2개 이상 필요합니다.", "danger");
      return;
    }

    if (league.matches.length > 0) {
      setMessage(
        "matchGeneration",
        "이미 경기 일정이 생성되어 있습니다. 중복 생성은 허용되지 않습니다.",
        "warning"
      );
      return;
    }

    const result = await runAdminAction("generate_matches");

    if (!result.ok) {
      setMessage(
        "matchGeneration",
        result.message || "경기 생성 중 오류가 발생했습니다.",
        result.tone || "danger"
      );
      return;
    }

    setMessage(
      "matchGeneration",
      result.message || "단일 풀리그 일정이 생성되었습니다.",
      "success"
    );
  }

  function openMatchModal(matchId) {
    const match = findMatchById(league.matches, matchId);

    if (!match) {
      setMessage("matches", "선택한 경기 정보를 찾을 수 없습니다.", "danger");
      return;
    }

    setSelectedMatchId(matchId);
    setModalScores({
      scoreA: formatScoreValue(match.scoreA),
      scoreB: formatScoreValue(match.scoreB),
    });
    clearMessage("modal");
  }

  function closeMatchModal() {
    setSelectedMatchId("");
    setModalScores({ scoreA: "", scoreB: "" });
    clearMessage("modal");

    if (pendingRealtimeRefreshRef.current && !loadingRef.current) {
      pendingRealtimeRefreshRef.current = false;
      void hydrateAdminPage("", { showBusy: false });
    }
  }

  async function handleMatchSave(event) {
    event.preventDefault();

    if (!selectedMatchId) {
      return;
    }

    const scoreA = normalizeScore(modalScores.scoreA);
    const scoreB = normalizeScore(modalScores.scoreB);

    if (scoreA === null || scoreB === null) {
      setMessage("modal", "점수는 0 이상의 정수만 저장할 수 있습니다.", "danger");
      return;
    }

    const result = await runAdminAction("update_match", {
      matchId: selectedMatchId,
      scoreA,
      scoreB,
    });

    if (!result.ok) {
      setMessage(
        "modal",
        result.message || "경기 결과 저장 중 오류가 발생했습니다.",
        result.tone || "danger"
      );
      return;
    }

    setMessage(
      "matches",
      result.message || "경기 결과를 저장했습니다. 순위표가 즉시 갱신되었습니다.",
      "success"
    );
    closeMatchModal();
  }

  async function handleMatchClear() {
    if (!selectedMatchId) {
      return;
    }

    const result = await runAdminAction("clear_match", {
      matchId: selectedMatchId,
    });

    if (!result.ok) {
      setMessage(
        "modal",
        result.message || "경기 결과 초기화 중 오류가 발생했습니다.",
        result.tone || "danger"
      );
      return;
    }

    setMessage(
      "matches",
      result.message || "경기 결과를 초기화했습니다. 순위표를 다시 계산했습니다.",
      "success"
    );
    closeMatchModal();
  }

  async function handleResetData() {
    const shouldReset = window.confirm(
      "Supabase에 저장된 팀 목록, 경기 기록, 대진 순서 이미지를 모두 삭제하고 처음 상태로 되돌릴까요? 이 작업은 되돌릴 수 없습니다."
    );

    if (!shouldReset) {
      setMessage("reset", "초기화를 취소했습니다.", "warning");
      return;
    }

    const result = await runAdminAction("reset_data");

    if (!result.ok) {
      setMessage("reset", result.message || "전체 초기화 중 오류가 발생했습니다.", result.tone || "danger");
      return;
    }

    setSelectedMatchId("");
    setSelectedLeagueImage(null);
    clearMessages(["team", "matchGeneration", "matches", "leagueImage"]);
    setMessage("reset", result.message || "모든 데이터를 초기화했습니다.", "success");
  }

  useEffect(() => {
    loadingRef.current = loading;
    document.body.dataset.busy = loading ? "true" : "false";
  }, [loading]);

  useEffect(() => {
    isUnlockedRef.current = isUnlocked;
  }, [isUnlocked]);

  useEffect(() => {
    isModalOpenRef.current = isModalOpen;
    document.body.classList.toggle("modal-open", isModalOpen);

    if (isModalOpen) {
      window.requestAnimationFrame(() => {
        modalScoreARef.current?.focus();
      });
    }

    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (selectedLeagueImage) {
      const previewUrl = URL.createObjectURL(selectedLeagueImage);
      setLeagueImagePreviewUrl(previewUrl);

      return () => {
        URL.revokeObjectURL(previewUrl);
      };
    }

    setLeagueImagePreviewUrl("");
    return undefined;
  }, [selectedLeagueImage]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const missingKeys = getMissingConfigKeys().join(", ");
      setMessage(
        "config",
        `Supabase 설정이 비어 있습니다. config.js의 ${missingKeys} 값을 채운 뒤 관리자 인증을 진행해 주세요.`,
        "warning"
      );
      setIsUnlocked(false);
      return;
    }

    if (isAdminSessionValid()) {
      void restoreAdminSession();
      return;
    }

    setIsUnlocked(false);
  }, []);

  useEffect(() => {
    if (!isUnlocked || !isSupabaseConfigured()) {
      return undefined;
    }

    const cleanupRealtime = subscribeToLeagueRealtime(scheduleRealtimeRefresh);

    return () => {
      if (refreshDebounceIdRef.current) {
        window.clearTimeout(refreshDebounceIdRef.current);
        refreshDebounceIdRef.current = null;
      }

      cleanupRealtime();
    };
  }, [isUnlocked]);

  const imagePreviewUrl = leagueImagePreviewUrl || league.leagueAsset?.imageUrl || "";
  const imageMeta = selectedLeagueImage
    ? `${selectedLeagueImage.name} (${formatFileSize(selectedLeagueImage.size)})`
    : league.leagueAsset?.imagePath
      ? "현재 저장된 대진 순서 이미지"
      : "";

  return (
    <div className="page-shell">
      {isUnlocked ? (
        <header className="hero-card">
          <div className="hero-copy">
            <p className="eyebrow">Tennis League Admin</p>
            <h1>관리자 페이지</h1>
          </div>

          <aside className="hero-aside">
            <div>
              <span className="hero-badge">Admin Mode</span>
              <p>관리자 세션은 24시간 유지되며, 만료되면 다시 비밀번호 인증이 필요합니다.</p>
            </div>
            <div className="hero-actions hero-actions-stack">
              <a className="secondary-button button-link" href="./index.html">
                보기 전용 페이지
              </a>
              <button
                className="ghost-danger-button"
                disabled={loading || isLocked}
                type="button"
                onClick={handleLogout}
              >
                로그아웃
              </button>
            </div>
          </aside>
        </header>
      ) : null}

      <ConfigNotice message={messages.config} />

      {!isUnlocked ? (
        <section className="panel auth-panel" aria-labelledby="auth-heading">
          <div className="section-header">
            <div>
              <p className="section-kicker">Access</p>
              <h2 id="auth-heading">관리자 인증</h2>
            </div>
          </div>
          <form className="auth-form" noValidate onSubmit={handlePasswordSubmit}>
            <label className="input-group">
              <span>관리자 비밀번호</span>
              <input
                autoComplete="current-password"
                disabled={loading || configMissing}
                name="password"
                placeholder="비밀번호 입력"
                type="password"
              />
            </label>
            <button className="primary-button" disabled={loading || configMissing} type="submit">
              인증
            </button>
          </form>
          <Message message={messages.auth} />
        </section>
      ) : (
        <main className="main-grid">
          <section className="panel status-panel" aria-live="polite">
            <Message className="status-banner" message={messages.adminStatus} />
          </section>

          <section className="panel summary-panel" aria-labelledby="summary-heading">
            <div className="section-header">
              <div>
                <h2 id="summary-heading">진행 현황</h2>
              </div>
            </div>
            <SummaryCards matches={league.matches} teams={league.teams} />
          </section>

          <section className="panel wide-panel" aria-labelledby="team-setup-heading">
            <div className="section-header">
              <div>
                <p className="section-kicker">Step 1</p>
                <h2 id="team-setup-heading">팀 등록 및 경기 생성</h2>
              </div>
            </div>

            <div className="setup-grid">
              <div className="setup-block">
                <form className="team-form" noValidate onSubmit={handleAddTeam}>
                  <label className="input-group">
                    <span>팀명</span>
                    <input
                      disabled={loading || isLocked || matchesExist}
                      maxLength="30"
                      name="teamName"
                      placeholder="예: 강동 에이스"
                      type="text"
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={loading || isLocked || matchesExist}
                    type="submit"
                  >
                    팀 추가
                  </button>
                </form>
                <Message message={messages.team} />
              </div>

              <div className="setup-block">
                <div className="action-card compact-action-card">
                  <div>
                    <strong>경기 생성</strong>
                    <p>2팀 이상부터 단일 풀리그를 생성합니다.</p>
                  </div>
                  <button
                    className="primary-button"
                    disabled={loading || isLocked || league.teams.length < 2 || matchesExist}
                    type="button"
                    onClick={handleGenerateMatches}
                  >
                    경기 생성
                  </button>
                </div>
                <Message message={messages.matchGeneration} />
              </div>
            </div>
          </section>

          <section className="panel wide-panel" aria-labelledby="team-list-heading">
            <div className="section-header">
              <div>
                <p className="section-kicker">Step 2</p>
                <h2 id="team-list-heading">등록된 팀 목록</h2>
              </div>
              <p className="section-description">경기 생성 후 팀 수정 잠금</p>
            </div>
            <TeamsList
              disableRemoveButton={league.matches.length > 0 || loading}
              onRemoveTeam={handleRemoveTeam}
              showRemoveButton
              teams={league.teams}
            />
          </section>

          <section className="panel wide-panel" aria-labelledby="matches-heading">
            <div className="section-header">
              <div>
                <p className="section-kicker">Step 3</p>
                <h2 id="matches-heading">경기 목록 및 점수 입력</h2>
              </div>
            </div>
            <p className="helper-text">셀 클릭으로 입력 또는 수정</p>
            <MatchesMatrix
              editable
              matches={league.matches}
              onOpenMatch={openMatchModal}
              teams={league.teams}
            />
            <Message message={messages.matches} />
          </section>

          <section className="panel wide-panel" aria-labelledby="standings-heading">
            <div className="section-header">
              <div>
                <p className="section-kicker">Step 4</p>
                <h2 id="standings-heading">순위표</h2>
              </div>
            </div>
            <StandingsTable matches={league.matches} teams={league.teams} />
          </section>

          <section className="panel wide-panel" aria-labelledby="league-image-heading">
            <div className="section-header">
              <div>
                <p className="section-kicker">Asset</p>
                <h2 id="league-image-heading">대진 순서 이미지</h2>
              </div>
            </div>

            <form className="asset-panel-form" noValidate onSubmit={handleLeagueImageSave}>
              <label className="input-group">
                <span>이미지 파일</span>
                <input
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={loading || isLocked}
                  type="file"
                  onChange={handleLeagueImageChange}
                />
              </label>

              <div className="asset-image-preview-card">
                {imagePreviewUrl ? (
                  <img
                    className="asset-image-preview"
                    src={imagePreviewUrl}
                    alt="대진 순서 이미지 미리보기"
                  />
                ) : (
                  <p className="helper-text">아직 등록된 대진 순서 이미지가 없습니다.</p>
                )}
                <p className="asset-image-meta">{imageMeta}</p>
              </div>

              <div className="asset-panel-actions">
                <button
                  className="primary-button"
                  disabled={loading || isLocked}
                  type="submit"
                >
                  이미지 저장
                </button>
                <button
                  className="secondary-button"
                  disabled={loading || isLocked || !league.leagueAsset?.imagePath}
                  type="button"
                  onClick={handleRemoveLeagueImage}
                >
                  이미지 삭제
                </button>
              </div>
            </form>
            <Message message={messages.leagueImage} />
          </section>

          <section className="panel danger-panel" aria-labelledby="reset-heading">
            <div className="section-header">
              <div>
                <p className="section-kicker">Maintenance</p>
                <h2 id="reset-heading">데이터 초기화</h2>
              </div>
            </div>
            <div className="action-card reset-card">
              <div>
                <strong>주의</strong>
                <p>초기화 후에는 저장된 팀과 경기 데이터가 모두 삭제됩니다.</p>
              </div>
              <button
                className="ghost-danger-button"
                disabled={loading || isLocked}
                type="button"
                onClick={handleResetData}
              >
                전체 초기화
              </button>
            </div>
            <Message message={messages.reset} />
          </section>
        </main>
      )}

      <MatchModal
        loading={loading}
        match={selectedMatch}
        matches={league.matches}
        modalScoreARef={modalScoreARef}
        onClear={handleMatchClear}
        onClose={closeMatchModal}
        onSave={handleMatchSave}
        scores={modalScores}
        setScores={setModalScores}
        message={messages.modal}
      />
    </div>
  );
}

function MatchModal({
  loading,
  match,
  matches,
  message,
  modalScoreARef,
  onClear,
  onClose,
  onSave,
  scores,
  setScores,
}) {
  if (!match) {
    return null;
  }

  const matchIndex = matches.findIndex((item) => item.id === match.id);
  const statusClass = match.isPlayed ? "played" : "pending";

  return (
    <section className="modal-overlay" aria-hidden="false" onClick={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="matchModalTitle"
        aria-describedby="matchModalDescription"
      >
        <div className="modal-header">
          <div>
            <p className="section-kicker modal-kicker">Match Editor</p>
            <h2 id="matchModalTitle">경기 점수 입력</h2>
            <p id="matchModalDescription" className="modal-description">
              점수 저장 시 승/무/패와 순위표가 자동으로 갱신됩니다.
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="경기 입력 모달 닫기"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-match-card">
            <span className="modal-match-number">{matchIndex + 1}경기</span>
            <strong className="modal-match-label">{match.teamA} vs {match.teamB}</strong>
            <span className={`match-badge ${statusClass}`}>{match.isPlayed ? "입력 완료" : "미입력"}</span>
          </div>

          <form className="modal-form" noValidate onSubmit={onSave}>
            <div className="modal-score-grid">
              <label className="input-group modal-input-group">
                <span>{match.teamA}</span>
                <input
                  ref={modalScoreARef}
                  inputMode="numeric"
                  min="0"
                  name="scoreA"
                  placeholder="0"
                  step="1"
                  type="number"
                  value={scores.scoreA}
                  onChange={(event) => setScores((current) => ({ ...current, scoreA: event.target.value }))}
                />
              </label>
              <div className="modal-score-divider">:</div>
              <label className="input-group modal-input-group">
                <span>{match.teamB}</span>
                <input
                  inputMode="numeric"
                  min="0"
                  name="scoreB"
                  placeholder="0"
                  step="1"
                  type="number"
                  value={scores.scoreB}
                  onChange={(event) => setScores((current) => ({ ...current, scoreB: event.target.value }))}
                />
              </label>
            </div>

            <p className="modal-note">점수는 0 이상의 정수만 입력할 수 있습니다.</p>
            <Message className="inline-message modal-message" message={message} />

            <div className="modal-footer">
              <button className="primary-button" disabled={loading} type="submit">
                저장
              </button>
              <button
                className="secondary-button"
                disabled={!match.isPlayed || loading}
                type="button"
                onClick={onClear}
              >
                결과 초기화
              </button>
              <button className="ghost-danger-button" type="button" onClick={onClose}>
                닫기
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<AdminPage />);
