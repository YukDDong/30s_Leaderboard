// localStorage에 저장할 때 사용할 키입니다.
const STORAGE_KEYS = {
  teams: "tennis_league_teams",
  matches: "tennis_league_matches",
};

// 앱 전체에서 공유하는 상태입니다.
const state = {
  teams: [],
  matches: [],
  selectedMatchId: null,
  isModalOpen: false,
  lastFocusedElement: null,
};

// 자주 사용하는 화면 요소를 한 곳에서 관리합니다.
const elements = {
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
  summaryCardTemplate: document.getElementById("summaryCardTemplate"),
  resetButton: document.getElementById("resetButton"),
  resetMessage: document.getElementById("resetMessage"),
  matchModalOverlay: document.getElementById("matchModalOverlay"),
  matchModal: document.getElementById("matchModal"),
  closeMatchModalButton: document.getElementById("closeMatchModalButton"),
  cancelMatchButton: document.getElementById("cancelMatchButton"),
  matchModalForm: document.getElementById("matchModalForm"),
  saveMatchButton: document.getElementById("saveMatchButton"),
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

function initializeApp() {
  loadData();
  bindEvents();
  renderApp();
}

function loadData() {
  const savedTeams = localStorage.getItem(STORAGE_KEYS.teams);
  const savedMatches = localStorage.getItem(STORAGE_KEYS.matches);

  state.teams = parseTeams(savedTeams);
  state.matches = parseMatches(savedMatches);
}

function saveData() {
  localStorage.setItem(STORAGE_KEYS.teams, JSON.stringify(state.teams));
  localStorage.setItem(STORAGE_KEYS.matches, JSON.stringify(state.matches));
}

function parseTeams(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((team) => typeof team === "string")
      .map((team) => team.trim())
      .filter((team) => team !== "");
  } catch (error) {
    console.error("팀 데이터 복원 중 오류가 발생했습니다.", error);
    return [];
  }
}

function parseMatches(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((match) => match && typeof match === "object")
      .map((match, index) => ({
        id: typeof match.id === "string" ? match.id : createMatchId(match.teamA, match.teamB, index),
        teamA: typeof match.teamA === "string" ? match.teamA : "",
        teamB: typeof match.teamB === "string" ? match.teamB : "",
        scoreA: Number.isInteger(match.scoreA) ? match.scoreA : null,
        scoreB: Number.isInteger(match.scoreB) ? match.scoreB : null,
        isPlayed: Boolean(match.isPlayed),
      }))
      .filter((match) => match.teamA && match.teamB && match.teamA !== match.teamB)
      .map((match) => ({
        ...match,
        isPlayed:
          match.isPlayed &&
          Number.isInteger(match.scoreA) &&
          match.scoreA >= 0 &&
          Number.isInteger(match.scoreB) &&
          match.scoreB >= 0,
      }));
  } catch (error) {
    console.error("경기 데이터 복원 중 오류가 발생했습니다.", error);
    return [];
  }
}

function bindEvents() {
  elements.teamForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addTeam(elements.teamNameInput.value);
  });

  elements.generateMatchesButton.addEventListener("click", () => {
    generateMatches();
  });

  elements.resetButton.addEventListener("click", () => {
    resetAllData();
  });

  elements.teamsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-team]");

    if (!button) {
      return;
    }

    removeTeam(button.dataset.team);
  });

  elements.matchesContainer.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-match-id]");
    const button = event.target.closest("button[data-open-match-id]");

    if (button) {
      openMatchModal(button.dataset.openMatchId, button);
      return;
    }

    if (row) {
      openMatchModal(row.dataset.matchId, row);
    }
  });

  elements.matchesContainer.addEventListener("keydown", (event) => {
    const row = event.target.closest("tr[data-match-id]");

    if (!row) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMatchModal(row.dataset.matchId, row);
    }
  });

  elements.matchModalForm.addEventListener("submit", (event) => {
    handleMatchSave(event);
  });

  elements.clearMatchButton.addEventListener("click", () => {
    handleMatchClear();
  });

  elements.closeMatchModalButton.addEventListener("click", () => {
    closeMatchModal();
  });

  elements.cancelMatchButton.addEventListener("click", () => {
    closeMatchModal();
  });

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

function addTeam(rawTeamName) {
  clearMessage(elements.resetMessage);
  clearMessage(elements.matchGenerationMessage);
  clearMessage(elements.matchesMessage);

  const teamName = typeof rawTeamName === "string" ? rawTeamName.trim() : "";

  if (teamName === "") {
    setMessage(elements.teamMessage, "팀명을 입력해 주세요.", "danger");
    return;
  }

  const isDuplicate = state.teams.some((team) => team.toLowerCase() === teamName.toLowerCase());

  if (isDuplicate) {
    setMessage(elements.teamMessage, "이미 등록된 팀명입니다. 다른 이름을 입력해 주세요.", "danger");
    return;
  }

  state.teams.push(teamName);
  saveData();
  renderApp();

  elements.teamNameInput.value = "";
  elements.teamNameInput.focus();
  setMessage(elements.teamMessage, `팀 \"${teamName}\"을(를) 추가했습니다.`, "success");
}

function removeTeam(teamName) {
  if (state.matches.length > 0) {
    setMessage(
      elements.teamMessage,
      "경기 일정이 이미 생성되어 팀 삭제가 잠겨 있습니다. 전체 초기화 후 다시 시작해 주세요.",
      "warning"
    );
    return;
  }

  state.teams = state.teams.filter((team) => team !== teamName);
  saveData();
  renderApp();
  setMessage(elements.teamMessage, `팀 \"${teamName}\"을(를) 삭제했습니다.`, "success");
}

function generateMatches() {
  clearMessage(elements.teamMessage);
  clearMessage(elements.resetMessage);
  clearMessage(elements.matchesMessage);

  if (state.teams.length < 2) {
    setMessage(elements.matchGenerationMessage, "경기를 생성하려면 팀이 2개 이상 필요합니다.", "danger");
    return;
  }

  if (state.matches.length > 0) {
    setMessage(elements.matchGenerationMessage, "이미 경기 일정이 생성되어 있습니다. 중복 생성은 허용되지 않습니다.", "warning");
    return;
  }

  const createdMatches = [];

  for (let teamAIndex = 0; teamAIndex < state.teams.length; teamAIndex += 1) {
    for (let teamBIndex = teamAIndex + 1; teamBIndex < state.teams.length; teamBIndex += 1) {
      const teamA = state.teams[teamAIndex];
      const teamB = state.teams[teamBIndex];

      createdMatches.push({
        id: createMatchId(teamA, teamB, createdMatches.length),
        teamA,
        teamB,
        scoreA: null,
        scoreB: null,
        isPlayed: false,
      });
    }
  }

  state.matches = createdMatches;
  saveData();
  renderApp();

  setMessage(
    elements.matchGenerationMessage,
    `총 ${createdMatches.length}경기의 단일 풀리그 일정이 생성되었습니다. 이제 경기 표에서 원하는 경기를 눌러 점수를 입력해 주세요.`,
    "success"
  );
}

function updateMatch(matchId, rawScoreA, rawScoreB) {
  const match = state.matches.find((item) => item.id === matchId);

  if (!match) {
    return { ok: false, message: "선택한 경기 정보를 찾을 수 없습니다.", tone: "danger" };
  }

  const scoreA = normalizeScore(rawScoreA);
  const scoreB = normalizeScore(rawScoreB);

  if (scoreA === null || scoreB === null) {
    return { ok: false, message: "점수는 0 이상의 정수만 저장할 수 있습니다.", tone: "danger" };
  }

  match.scoreA = scoreA;
  match.scoreB = scoreB;
  match.isPlayed = true;

  saveData();
  renderApp();

  return {
    ok: true,
    message: `${match.teamA} vs ${match.teamB} 경기 결과를 저장했습니다. 순위표가 즉시 갱신되었습니다.`,
    tone: "success",
  };
}

function clearMatchResult(matchId) {
  const match = state.matches.find((item) => item.id === matchId);

  if (!match) {
    return { ok: false, message: "선택한 경기 정보를 찾을 수 없습니다.", tone: "danger" };
  }

  match.scoreA = null;
  match.scoreB = null;
  match.isPlayed = false;

  saveData();
  renderApp();

  return {
    ok: true,
    message: `${match.teamA} vs ${match.teamB} 경기 결과를 초기화했습니다. 순위표를 다시 계산했습니다.`,
    tone: "success",
  };
}

function calculateStandings() {
  const standingsMap = new Map();

  state.teams.forEach((team, index) => {
    standingsMap.set(team, {
      order: index,
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    });
  });

  state.matches.forEach((match) => {
    if (!match.isPlayed) {
      return;
    }

    const teamAStats = standingsMap.get(match.teamA);
    const teamBStats = standingsMap.get(match.teamB);

    if (!teamAStats || !teamBStats) {
      return;
    }

    teamAStats.played += 1;
    teamBStats.played += 1;

    teamAStats.goalsFor += match.scoreA;
    teamAStats.goalsAgainst += match.scoreB;
    teamBStats.goalsFor += match.scoreB;
    teamBStats.goalsAgainst += match.scoreA;

    if (match.scoreA > match.scoreB) {
      teamAStats.wins += 1;
      teamBStats.losses += 1;
      teamAStats.points += 3;
    } else if (match.scoreA < match.scoreB) {
      teamBStats.wins += 1;
      teamAStats.losses += 1;
      teamBStats.points += 3;
    } else {
      teamAStats.draws += 1;
      teamBStats.draws += 1;
      teamAStats.points += 1;
      teamBStats.points += 1;
    }
  });

  const standings = Array.from(standingsMap.values()).map((row) => ({
    ...row,
    goalDiff: row.goalsFor - row.goalsAgainst,
  }));

  return standings.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    if (b.goalDiff !== a.goalDiff) {
      return b.goalDiff - a.goalDiff;
    }

    return a.order - b.order;
  });
}

function renderSummary() {
  const playedMatches = state.matches.filter((match) => match.isPlayed).length;
  const totalMatches = state.matches.length;
  const remainingMatches = Math.max(totalMatches - playedMatches, 0);

  const cardData = [
    {
      label: "총 팀 수",
      value: state.teams.length,
      note: "현재 등록된 리그 참가 팀 수",
    },
    {
      label: "총 경기 수",
      value: totalMatches,
      note: totalMatches > 0 ? "단일 풀리그 기준 전체 경기 수" : "아직 생성된 일정이 없습니다",
    },
    {
      label: "입력 완료 경기 수",
      value: playedMatches,
      note: playedMatches > 0 ? "점수가 저장된 경기 수" : "아직 저장된 결과가 없습니다",
    },
    {
      label: "남은 경기 수",
      value: remainingMatches,
      note: totalMatches > 0 ? "아직 점수를 입력하지 않은 경기 수" : "팀 등록 후 경기 생성이 필요합니다",
    },
  ];

  elements.summaryCards.innerHTML = "";

  cardData.forEach((card) => {
    const template = elements.summaryCardTemplate.content.cloneNode(true);

    template.querySelector(".summary-label").textContent = card.label;
    template.querySelector(".summary-value").textContent = String(card.value);
    template.querySelector(".summary-note").textContent = card.note;

    elements.summaryCards.appendChild(template);
  });
}

function renderTeams() {
  const matchesExist = state.matches.length > 0;

  elements.teamsContainer.innerHTML = "";
  elements.addTeamButton.disabled = matchesExist;
  elements.teamNameInput.disabled = matchesExist;

  if (matchesExist) {
    if (!elements.teamMessage.textContent) {
      setMessage(
        elements.teamMessage,
        "경기 일정이 생성된 뒤에는 팀 목록이 잠깁니다. 수정이 필요하면 전체 초기화를 사용해 주세요.",
        "warning"
      );
    }
  }

  if (state.teams.length === 0) {
    elements.teamsContainer.appendChild(
      createEmptyState(
        "아직 등록된 팀이 없습니다.",
        "먼저 팀명을 입력해 참가 팀을 추가한 뒤 경기 일정을 생성하세요."
      )
    );
    return;
  }

  state.teams.forEach((team) => {
    const teamItem = document.createElement("article");
    teamItem.className = "team-item";

    const meta = document.createElement("div");
    meta.className = "team-meta";

    const name = document.createElement("strong");
    name.className = "team-name";
    name.textContent = team;

    const note = document.createElement("span");
    note.className = "team-note";
    note.textContent = matchesExist ? "경기 일정 생성 완료: 삭제 잠금" : "경기 생성 전: 삭제 가능";

    const removeButton = document.createElement("button");
    removeButton.className = "secondary-button";
    removeButton.type = "button";
    removeButton.dataset.team = team;
    removeButton.textContent = "팀 삭제";
    removeButton.disabled = matchesExist;

    meta.append(name, note);
    teamItem.append(meta, removeButton);
    elements.teamsContainer.appendChild(teamItem);
  });
}

function renderMatches() {
  elements.matchesContainer.innerHTML = "";

  if (state.matches.length === 0) {
    elements.matchesContainer.appendChild(
      createEmptyState(
        "아직 생성된 경기가 없습니다.",
        "팀을 2개 이상 등록한 뒤 경기 생성 버튼을 눌러 일정 목록을 만드세요."
      )
    );
    return;
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap";

  const table = document.createElement("table");
  table.className = "matches-table";
  table.innerHTML = `
    <caption class="sr-only">경기 목록 표. 각 행을 클릭하면 점수 입력 또는 수정 모달이 열립니다.</caption>
    <thead>
      <tr>
        <th>번호</th>
        <th>팀 A</th>
        <th>팀 B</th>
        <th>현재 스코어</th>
        <th>상태</th>
        <th>입력</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  state.matches.forEach((match, index) => {
    const row = document.createElement("tr");
    row.className = `clickable-row ${match.isPlayed ? "match-row-played" : "match-row-pending"}`;
    row.dataset.matchId = match.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `${index + 1}경기 ${match.teamA} 대 ${match.teamB} 점수 ${formatMatchScore(match)} 편집 열기`);

    const statusClass = match.isPlayed ? "played" : "pending";
    const actionLabel = match.isPlayed ? "수정" : "입력";

    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(match.teamA)}</td>
      <td>${escapeHtml(match.teamB)}</td>
      <td class="match-score-cell">${escapeHtml(formatMatchScore(match))}</td>
      <td><span class="match-badge ${statusClass}">${match.isPlayed ? "입력 완료" : "미입력"}</span></td>
      <td>
        <button class="table-action-button" type="button" data-open-match-id="${match.id}">${actionLabel}</button>
      </td>
    `;

    tbody.appendChild(row);
  });

  tableWrap.appendChild(table);
  elements.matchesContainer.appendChild(tableWrap);
}

function renderStandings() {
  elements.standingsBody.innerHTML = "";

  if (state.teams.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="10">팀을 등록하면 순위표가 이곳에 표시됩니다.</td>';
    elements.standingsBody.appendChild(row);
    return;
  }

  const standings = calculateStandings();

  standings.forEach((teamStats, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(teamStats.team)}</td>
      <td>${teamStats.played}</td>
      <td>${teamStats.wins}</td>
      <td>${teamStats.draws}</td>
      <td>${teamStats.losses}</td>
      <td>${teamStats.goalsFor}</td>
      <td>${teamStats.goalsAgainst}</td>
      <td>${teamStats.goalDiff}</td>
      <td>${teamStats.points}</td>
    `;

    elements.standingsBody.appendChild(row);
  });
}

function renderApp() {
  renderSummary();
  renderTeams();
  renderMatches();
  renderStandings();
  updateButtonStates();

  if (state.isModalOpen && state.selectedMatchId) {
    const selectedMatch = findMatchById(state.selectedMatchId);

    if (selectedMatch) {
      populateMatchModal(selectedMatch);
    } else {
      closeMatchModal({ restoreFocus: false });
    }
  }
}

function updateButtonStates() {
  elements.generateMatchesButton.disabled = state.teams.length < 2 || state.matches.length > 0;
}

function openMatchModal(matchId, triggerElement = null) {
  const match = findMatchById(matchId);

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

function closeMatchModal(options = {}) {
  const { restoreFocus = true } = options;

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
  elements.clearMatchButton.disabled = !match.isPlayed;
}

function handleMatchSave(event) {
  event.preventDefault();

  if (!state.selectedMatchId) {
    return;
  }

  const result = updateMatch(state.selectedMatchId, elements.modalScoreA.value, elements.modalScoreB.value);

  if (!result.ok) {
    setMessage(elements.modalErrorMessage, result.message, result.tone);
    return;
  }

  setMessage(elements.matchesMessage, result.message, result.tone);
  closeMatchModal();
}

function handleMatchClear() {
  if (!state.selectedMatchId) {
    return;
  }

  const result = clearMatchResult(state.selectedMatchId);

  if (!result.ok) {
    setMessage(elements.modalErrorMessage, result.message, result.tone);
    return;
  }

  setMessage(elements.matchesMessage, result.message, result.tone);
  closeMatchModal();
}

function resetAllData() {
  const shouldReset = window.confirm(
    "팀 목록과 경기 기록을 모두 삭제하고 처음 상태로 되돌릴까요? 이 작업은 되돌릴 수 없습니다."
  );

  if (!shouldReset) {
    setMessage(elements.resetMessage, "초기화를 취소했습니다.", "warning");
    return;
  }

  state.teams = [];
  state.matches = [];

  if (state.isModalOpen) {
    closeMatchModal({ restoreFocus: false });
  }

  localStorage.removeItem(STORAGE_KEYS.teams);
  localStorage.removeItem(STORAGE_KEYS.matches);

  clearMessage(elements.teamMessage);
  clearMessage(elements.matchGenerationMessage);
  clearMessage(elements.matchesMessage);
  renderApp();

  setMessage(elements.resetMessage, "모든 데이터를 초기화했습니다. 빈 상태에서 다시 시작할 수 있습니다.", "success");
}

function findMatchById(matchId) {
  return state.matches.find((item) => item.id === matchId) || null;
}

function createMatchId(teamA, teamB, index) {
  const safeTeamA = sanitizeForId(teamA);
  const safeTeamB = sanitizeForId(teamB);
  return `match_${safeTeamA}_${safeTeamB}_${index}`;
}

function sanitizeForId(value) {
  const sanitized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "team";
}

function normalizeScore(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmedValue = String(value).trim();

  if (trimmedValue === "") {
    return null;
  }

  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsed = Number(trimmedValue);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function formatMatchScore(match) {
  return match.isPlayed ? `${match.scoreA} : ${match.scoreB}` : "-";
}

function formatScoreValue(score) {
  return Number.isInteger(score) ? String(score) : "";
}

function setMessage(element, message, tone = "warning") {
  element.textContent = message;
  element.dataset.tone = tone;
}

function clearMessage(element) {
  element.textContent = "";
  delete element.dataset.tone;
}

function createEmptyState(title, description) {
  const emptyState = document.createElement("article");
  emptyState.className = "empty-state";
  emptyState.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(description)}</p>
  `;
  return emptyState;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

initializeApp();
