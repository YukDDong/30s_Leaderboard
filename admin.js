import {
  clearMessage,
  findMatchById,
  formatScoreValue,
  normalizeLeagueData,
  normalizeScore,
  renderMatches,
  renderStandings,
  renderSummary,
  renderTeams,
  setMessage,
} from "./app.js";
import {
  callAdminFunction,
  cleanupUploadedLeagueAssetImage,
  fetchLeagueData,
  getMissingConfigKeys,
  isSupabaseConfigured,
  uploadLeagueAssetImage,
  validateLeagueImageFile,
  verifyAdminPassword,
} from "./supabase-client.js";

const SESSION_KEYS = {
  token: "admin_session_token",
  expiresAt: "admin_session_expires_at",
};

const state = {
  teams: [],
  matches: [],
  leagueAsset: null,
  selectedMatchId: null,
  isModalOpen: false,
  lastFocusedElement: null,
  loading: false,
  pendingLeagueImagePreviewUrl: "",
};

const elements = {
  adminHeader: document.getElementById("adminHeader"),
  configNotice: document.getElementById("configNotice"),
  configNoticeMessage: document.getElementById("configNoticeMessage"),
  authPanel: document.getElementById("authPanel"),
  authForm: document.getElementById("authForm"),
  passwordInput: document.getElementById("passwordInput"),
  authButton: document.getElementById("authButton"),
  authMessage: document.getElementById("authMessage"),
  logoutButton: document.getElementById("logoutButton"),
  adminWorkspace: document.getElementById("adminWorkspace"),
  adminStatusMessage: document.getElementById("adminStatusMessage"),
  leagueImageForm: document.getElementById("leagueImageForm"),
  leagueImageInput: document.getElementById("leagueImageInput"),
  saveLeagueImageButton: document.getElementById("saveLeagueImageButton"),
  removeLeagueImageButton: document.getElementById("removeLeagueImageButton"),
  leagueImagePreview: document.getElementById("leagueImagePreview"),
  leagueImageEmpty: document.getElementById("leagueImageEmpty"),
  leagueImageMeta: document.getElementById("leagueImageMeta"),
  leagueImageMessage: document.getElementById("leagueImageMessage"),
  teamForm: document.getElementById("teamForm"),
  teamNameInput: document.getElementById("teamNameInput"),
  addTeamButton: document.getElementById("addTeamButton"),
  teamMessage: document.getElementById("teamMessage"),
  teamsContainer: document.getElementById("teamsContainer"),
  generateMatchesButton: document.getElementById("generateMatchesButton"),
  matchGenerationMessage: document.getElementById("matchGenerationMessage"),
  matchesContainer: document.getElementById("matchesContainer"),
  matchesMessage: document.getElementById("matchesMessage"),
  standingsBody: document.getElementById("standingsBody"),
  summaryCards: document.getElementById("summaryCards"),
  resetButton: document.getElementById("resetButton"),
  resetMessage: document.getElementById("resetMessage"),
  matchModalOverlay: document.getElementById("matchModalOverlay"),
  matchModalForm: document.getElementById("matchModalForm"),
  closeMatchModalButton: document.getElementById("closeMatchModalButton"),
  cancelMatchButton: document.getElementById("cancelMatchButton"),
  clearMatchButton: document.getElementById("clearMatchButton"),
  modalMatchNumber: document.getElementById("modalMatchNumber"),
  modalMatchLabel: document.getElementById("modalMatchLabel"),
  modalMatchStatus: document.getElementById("modalMatchStatus"),
  modalTeamALabel: document.getElementById("modalTeamALabel"),
  modalTeamBLabel: document.getElementById("modalTeamBLabel"),
  modalScoreA: document.getElementById("modalScoreA"),
  modalScoreB: document.getElementById("modalScoreB"),
  modalErrorMessage: document.getElementById("modalErrorMessage"),
};

initializeAdminPage();

function initializeAdminPage() {
  bindEvents();

  if (!isSupabaseConfigured()) {
    const missingKeys = getMissingConfigKeys().join(", ");
    elements.configNotice.hidden = false;
    setMessage(
      elements.configNoticeMessage,
      `Supabase 설정이 비어 있습니다. config.js의 ${missingKeys} 값을 채운 뒤 관리자 인증을 진행해 주세요.`,
      "warning"
    );
    lockAdmin();
    return;
  }

  if (isAdminSessionValid()) {
    void restoreAdminSession();
    return;
  }

  lockAdmin();
}

function bindEvents() {
  elements.authForm.addEventListener("submit", handlePasswordSubmit);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.leagueImageForm.addEventListener("submit", handleLeagueImageSave);
  elements.leagueImageInput.addEventListener("change", handleLeagueImageChange);
  elements.removeLeagueImageButton.addEventListener("click", handleRemoveLeagueImage);
  elements.teamForm.addEventListener("submit", handleAddTeam);
  elements.teamsContainer.addEventListener("click", handleRemoveTeam);
  elements.generateMatchesButton.addEventListener("click", handleGenerateMatches);
  elements.resetButton.addEventListener("click", handleResetData);
  elements.matchesContainer.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-open-match-id]");

    if (!button) {
      return;
    }

    openMatchModal(button.dataset.openMatchId, button);
  });
  elements.matchModalForm.addEventListener("submit", handleMatchSave);
  elements.clearMatchButton.addEventListener("click", handleMatchClear);
  elements.closeMatchModalButton.addEventListener("click", () => closeMatchModal());
  elements.cancelMatchButton.addEventListener("click", () => closeMatchModal());
  elements.matchModalOverlay.addEventListener("click", (event) => {
    if (event.target === elements.matchModalOverlay) {
      closeMatchModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.isModalOpen) {
      closeMatchModal();
    }
  });
}

async function handlePasswordSubmit(event) {
  event.preventDefault();

  const password = elements.passwordInput.value.trim();

  if (!password) {
    setMessage(elements.authMessage, "비밀번호를 입력해 주세요.", "danger");
    return;
  }

  setBusy(true, "관리자 비밀번호를 검증하는 중입니다.");

  try {
    const result = await verifyAdminPassword(password);
    saveAdminSession(result.token, result.expiresAt);
    elements.passwordInput.value = "";
    unlockAdmin();
    setMessage(elements.authMessage, "인증에 성공했습니다.", "success");
    await hydrateAdminPage("관리자 세션이 열렸습니다.");
  } catch (error) {
    setMessage(
      elements.authMessage,
      error.message || "비밀번호 검증에 실패했습니다. Edge Function 설정을 확인해 주세요.",
      "danger"
    );
  } finally {
    setBusy(false);
  }
}

async function hydrateAdminPage(statusMessage = "") {
  setBusy(true, "Supabase에서 최신 리그 데이터를 불러오는 중입니다.");

  try {
    const { teams, matches, leagueAsset } = await fetchLeagueData();
    const normalized = normalizeLeagueData(teams, matches);
    state.teams = normalized.teams;
    state.matches = normalized.matches;
    state.leagueAsset = leagueAsset;
    renderAdminWorkspace();

    if (statusMessage) {
      setMessage(elements.adminStatusMessage, statusMessage, "success");
    } else {
      clearMessage(elements.adminStatusMessage);
    }
  } catch (error) {
    renderAdminWorkspace();
    setMessage(
      elements.adminStatusMessage,
      error.message || "리그 데이터를 불러오지 못했습니다. Supabase 설정과 네트워크 상태를 확인해 주세요.",
      "danger"
    );
  } finally {
    setBusy(false);
  }
}

async function restoreAdminSession() {
  lockAdmin();
  setBusy(true);
  setMessage(elements.authMessage, "이전 관리자 세션을 확인하는 중입니다.", "warning");

  try {
    const session = loadAdminSession();
    await callAdminFunction("session_status", {}, session.token);
    unlockAdmin();
    clearMessage(elements.authMessage);
    await hydrateAdminPage("이전 관리자 세션을 복원했습니다.");
  } catch (error) {
    expireAdminSession("관리자 세션이 만료되었거나 유효하지 않습니다. 다시 비밀번호를 입력해 주세요.");
  } finally {
    setBusy(false);
  }
}

function renderAdminWorkspace() {
  renderSummary(elements.summaryCards, state.teams, state.matches);
  renderLeagueImagePanel();
  renderTeams(elements.teamsContainer, state.teams, {
    showRemoveButton: true,
    disableRemoveButton: state.matches.length > 0 || state.loading,
  });
  renderMatches(elements.matchesContainer, state.teams, state.matches, {
    editable: true,
  });
  renderStandings(elements.standingsBody, state.teams, state.matches);
  updateButtonStates();
}

function renderLeagueImagePanel(selectedFile = null) {
  const previewUrl = selectedFile
    ? URL.createObjectURL(selectedFile)
    : state.leagueAsset?.imageUrl || "";
  const hasPreview = Boolean(previewUrl);

  revokePendingLeagueImagePreview();

  if (selectedFile) {
    state.pendingLeagueImagePreviewUrl = previewUrl;
  }

  elements.leagueImagePreview.hidden = !hasPreview;
  elements.leagueImageEmpty.hidden = hasPreview;

  if (hasPreview) {
    elements.leagueImagePreview.src = previewUrl;
  } else {
    elements.leagueImagePreview.removeAttribute("src");
  }

  if (selectedFile) {
    elements.leagueImageMeta.textContent = `${selectedFile.name} (${formatFileSize(selectedFile.size)})`;
    return;
  }

  if (state.leagueAsset?.imagePath) {
    elements.leagueImageMeta.textContent = "현재 저장된 대진 순서 이미지";
    return;
  }

  elements.leagueImageMeta.textContent = "";
}

function updateButtonStates() {
  const isLocked = !isAdminSessionValid();
  const configMissing = !isSupabaseConfigured();
  const matchesExist = state.matches.length > 0;

  elements.authButton.disabled = state.loading || configMissing;
  elements.passwordInput.disabled = state.loading || configMissing;
  elements.logoutButton.disabled = state.loading || isLocked;
  elements.leagueImageInput.disabled = state.loading || isLocked;
  elements.saveLeagueImageButton.disabled = state.loading || isLocked;
  elements.removeLeagueImageButton.disabled =
    state.loading || isLocked || !state.leagueAsset?.imagePath;
  elements.addTeamButton.disabled = state.loading || isLocked || matchesExist;
  elements.teamNameInput.disabled = state.loading || isLocked || matchesExist;
  elements.generateMatchesButton.disabled =
    state.loading || isLocked || state.teams.length < 2 || matchesExist;
  elements.resetButton.disabled = state.loading || isLocked;
}

function handleLeagueImageChange(event) {
  const file = event.target.files?.[0] || null;
  clearMessage(elements.leagueImageMessage);

  if (!file) {
    renderLeagueImagePanel();
    return;
  }

  const validationMessage = validateLeagueImageFile(file);

  if (validationMessage) {
    elements.leagueImageInput.value = "";
    renderLeagueImagePanel();
    setMessage(elements.leagueImageMessage, validationMessage, "danger");
    return;
  }

  renderLeagueImagePanel(file);
}

async function handleLeagueImageSave(event) {
  event.preventDefault();
  clearMessage(elements.resetMessage);
  clearMessage(elements.leagueImageMessage);

  const selectedFile = elements.leagueImageInput.files?.[0] || null;

  if (!selectedFile) {
    setMessage(elements.leagueImageMessage, "업로드할 이미지를 먼저 선택해 주세요.", "warning");
    return;
  }

  const validationMessage = validateLeagueImageFile(selectedFile);

  if (validationMessage) {
    setMessage(elements.leagueImageMessage, validationMessage, "danger");
    return;
  }

  const session = loadAdminSession();
  const previousImagePath = state.leagueAsset?.imagePath || "";
  let uploadedImagePath = "";

  try {
    const uploadedImage = await uploadLeagueAssetImage(selectedFile, session.token);
    uploadedImagePath = uploadedImage.path;
  } catch (error) {
    setMessage(
      elements.leagueImageMessage,
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
      elements.leagueImageMessage,
      result.message || "대진 순서 이미지 저장 중 오류가 발생했습니다.",
      result.tone || "danger"
    );
    return;
  }

  elements.leagueImageInput.value = "";
  setMessage(
    elements.leagueImageMessage,
    result.message || "대진 순서 이미지를 저장했습니다.",
    "success"
  );
}

async function handleRemoveLeagueImage() {
  clearMessage(elements.resetMessage);
  clearMessage(elements.leagueImageMessage);

  if (!state.leagueAsset?.imagePath) {
    setMessage(elements.leagueImageMessage, "삭제할 대진 순서 이미지가 없습니다.", "warning");
    return;
  }

  const result = await runAdminAction("remove_league_asset_image");

  if (!result.ok) {
    setMessage(
      elements.leagueImageMessage,
      result.message || "대진 순서 이미지 삭제 중 오류가 발생했습니다.",
      result.tone || "danger"
    );
    return;
  }

  elements.leagueImageInput.value = "";
  setMessage(
    elements.leagueImageMessage,
    result.message || "대진 순서 이미지를 삭제했습니다.",
    "success"
  );
}

function revokePendingLeagueImagePreview() {
  if (!state.pendingLeagueImagePreviewUrl) {
    return;
  }

  URL.revokeObjectURL(state.pendingLeagueImagePreviewUrl);
  state.pendingLeagueImagePreviewUrl = "";
}

async function handleAddTeam(event) {
  event.preventDefault();
  clearMessage(elements.resetMessage);
  clearMessage(elements.matchGenerationMessage);
  clearMessage(elements.matchesMessage);

  const teamName = elements.teamNameInput.value.trim();

  if (!teamName) {
    setMessage(elements.teamMessage, "팀명을 입력해 주세요.", "danger");
    return;
  }

  const result = await runAdminAction("add_team", { name: teamName });

  if (!result.ok) {
    setMessage(
      elements.teamMessage,
      result.message || "팀 추가 중 오류가 발생했습니다.",
      result.tone || "danger"
    );
    return;
  }

  elements.teamNameInput.value = "";
  elements.teamNameInput.focus();
  setMessage(elements.teamMessage, result.message || `팀 "${teamName}"을(를) 추가했습니다.`, "success");
}

async function handleRemoveTeam(event) {
  const button = event.target.closest("button[data-team-id]");

  if (!button) {
    return;
  }

  if (state.matches.length > 0) {
    setMessage(
      elements.teamMessage,
      "경기 일정이 이미 생성되어 팀 삭제가 잠겨 있습니다. 전체 초기화 후 다시 시작해 주세요.",
      "warning"
    );
    return;
  }

  const team = state.teams.find((item) => item.id === button.dataset.teamId);

  if (!team) {
    setMessage(elements.teamMessage, "선택한 팀 정보를 찾을 수 없습니다.", "danger");
    return;
  }

  const result = await runAdminAction("remove_team", { teamId: team.id });

  if (!result.ok) {
    setMessage(
      elements.teamMessage,
      result.message || "팀 삭제 중 오류가 발생했습니다.",
      result.tone || "danger"
    );
    return;
  }

  setMessage(elements.teamMessage, result.message || `팀 "${team.name}"을(를) 삭제했습니다.`, "success");
}

async function handleGenerateMatches() {
  clearMessage(elements.teamMessage);
  clearMessage(elements.resetMessage);
  clearMessage(elements.matchesMessage);

  if (state.teams.length < 2) {
    setMessage(elements.matchGenerationMessage, "경기를 생성하려면 팀이 2개 이상 필요합니다.", "danger");
    return;
  }

  if (state.matches.length > 0) {
    setMessage(
      elements.matchGenerationMessage,
      "이미 경기 일정이 생성되어 있습니다. 중복 생성은 허용되지 않습니다.",
      "warning"
    );
    return;
  }

  const result = await runAdminAction("generate_matches");

  if (!result.ok) {
    setMessage(
      elements.matchGenerationMessage,
      result.message || "경기 생성 중 오류가 발생했습니다.",
      result.tone || "danger"
    );
    return;
  }

  setMessage(
    elements.matchGenerationMessage,
    result.message || `총 ${state.matches.length}경기의 단일 풀리그 일정이 생성되었습니다.`,
    "success"
  );
}

function openMatchModal(matchId, triggerElement = null) {
  const match = findMatchById(state.matches, matchId);

  if (!match) {
    setMessage(elements.matchesMessage, "선택한 경기 정보를 찾을 수 없습니다.", "danger");
    return;
  }

  state.selectedMatchId = matchId;
  state.isModalOpen = true;
  state.lastFocusedElement = triggerElement || document.activeElement;

  populateMatchModal(match);
  clearMessage(elements.modalErrorMessage);

  elements.matchModalOverlay.hidden = false;
  elements.matchModalOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  window.requestAnimationFrame(() => {
    elements.modalScoreA.focus();
  });
}

function closeMatchModal({ restoreFocus = true } = {}) {
  state.selectedMatchId = null;
  state.isModalOpen = false;

  elements.matchModalForm.reset();
  clearMessage(elements.modalErrorMessage);
  elements.matchModalOverlay.hidden = true;
  elements.matchModalOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

  if (restoreFocus && state.lastFocusedElement && typeof state.lastFocusedElement.focus === "function") {
    state.lastFocusedElement.focus();
  }

  state.lastFocusedElement = null;
}

function populateMatchModal(match) {
  const matchIndex = state.matches.findIndex((item) => item.id === match.id);
  const statusClass = match.isPlayed ? "played" : "pending";

  elements.modalMatchNumber.textContent = `${matchIndex + 1}경기`;
  elements.modalMatchLabel.textContent = `${match.teamA} vs ${match.teamB}`;
  elements.modalTeamALabel.textContent = match.teamA;
  elements.modalTeamBLabel.textContent = match.teamB;
  elements.modalScoreA.value = formatScoreValue(match.scoreA);
  elements.modalScoreB.value = formatScoreValue(match.scoreB);
  elements.modalMatchStatus.textContent = match.isPlayed ? "입력 완료" : "미입력";
  elements.modalMatchStatus.className = `match-badge ${statusClass}`;
  elements.clearMatchButton.disabled = !match.isPlayed || state.loading;
}

async function handleMatchSave(event) {
  event.preventDefault();

  if (!state.selectedMatchId) {
    return;
  }

  const scoreA = normalizeScore(elements.modalScoreA.value);
  const scoreB = normalizeScore(elements.modalScoreB.value);

  if (scoreA === null || scoreB === null) {
    setMessage(elements.modalErrorMessage, "점수는 0 이상의 정수만 저장할 수 있습니다.", "danger");
    return;
  }

  const result = await runAdminAction("update_match", {
    matchId: state.selectedMatchId,
    scoreA,
    scoreB,
  });

  if (!result.ok) {
    setMessage(
      elements.modalErrorMessage,
      result.message || "경기 결과 저장 중 오류가 발생했습니다.",
      result.tone || "danger"
    );
    return;
  }

  setMessage(
    elements.matchesMessage,
    result.message || "경기 결과를 저장했습니다. 순위표가 즉시 갱신되었습니다.",
    "success"
  );
  closeMatchModal();
}

async function handleMatchClear() {
  if (!state.selectedMatchId) {
    return;
  }

  const result = await runAdminAction("clear_match", {
    matchId: state.selectedMatchId,
  });

  if (!result.ok) {
    setMessage(
      elements.modalErrorMessage,
      result.message || "경기 결과 초기화 중 오류가 발생했습니다.",
      result.tone || "danger"
    );
    return;
  }

  setMessage(
    elements.matchesMessage,
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
    setMessage(elements.resetMessage, "초기화를 취소했습니다.", "warning");
    return;
  }

  const result = await runAdminAction("reset_data");

  if (!result.ok) {
    setMessage(
      elements.resetMessage,
      result.message || "전체 초기화 중 오류가 발생했습니다.",
      result.tone || "danger"
    );
    return;
  }

  if (state.isModalOpen) {
    closeMatchModal({ restoreFocus: false });
  }

  elements.leagueImageInput.value = "";
  clearMessage(elements.teamMessage);
  clearMessage(elements.matchGenerationMessage);
  clearMessage(elements.matchesMessage);
  clearMessage(elements.leagueImageMessage);
  setMessage(elements.resetMessage, result.message || "모든 데이터를 초기화했습니다.", "success");
}

async function runAdminAction(action, payload = {}) {
  if (!isAdminSessionValid()) {
    expireAdminSession("관리자 세션이 만료되었습니다. 다시 비밀번호를 입력해 주세요.");
    return { ok: false, tone: "warning", message: "관리자 세션이 만료되었습니다." };
  }

  setBusy(true, "관리자 요청을 처리하는 중입니다.");

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
    setBusy(false);
  }
}

function handleLogout() {
  clearAdminSession();
  revokePendingLeagueImagePreview();

  if (state.isModalOpen) {
    closeMatchModal({ restoreFocus: false });
  }

  clearMessage(elements.adminStatusMessage);
  setMessage(elements.authMessage, "로그아웃되었습니다. 다시 비밀번호를 입력해 주세요.", "warning");
  lockAdmin();
}

function lockAdmin() {
  elements.adminHeader.hidden = true;
  elements.authPanel.hidden = false;
  elements.adminWorkspace.hidden = true;
  updateButtonStates();
}

function unlockAdmin() {
  elements.adminHeader.hidden = false;
  elements.authPanel.hidden = true;
  elements.adminWorkspace.hidden = false;
  renderAdminWorkspace();
  updateButtonStates();
}

function setBusy(isBusy, statusMessage = "") {
  state.loading = isBusy;
  document.body.dataset.busy = isBusy ? "true" : "false";
  updateButtonStates();

  if (isBusy && elements.adminWorkspace.hidden === false && statusMessage) {
    setMessage(elements.adminStatusMessage, statusMessage, "warning");
  }

  if (state.selectedMatchId) {
    const selectedMatch = findMatchById(state.matches, state.selectedMatchId);

    if (selectedMatch) {
      populateMatchModal(selectedMatch);
    }
  }
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
  const session = loadAdminSession();

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
  lockAdmin();
  setMessage(elements.authMessage, message, "warning");
}

function formatFileSize(sizeInBytes) {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) {
    return "0B";
  }

  if (sizeInBytes >= 1024 * 1024) {
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  if (sizeInBytes >= 1024) {
    return `${Math.round(sizeInBytes / 1024)}KB`;
  }

  return `${sizeInBytes}B`;
}
