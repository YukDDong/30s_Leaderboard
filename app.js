// localStorage에 저장할 때 사용할 키입니다.
const STORAGE_KEYS = {
  teams: "tennis_league_teams",
  matches: "tennis_league_matches",
};

// 앱 전체에서 공유하는 상태입니다.
const state = {
  teams: [],
  matches: [],
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
  standingsBody: document.getElementById("standingsBody"),
  summaryCards: document.getElementById("summaryCards"),
  summaryCardTemplate: document.getElementById("summaryCardTemplate"),
  resetButton: document.getElementById("resetButton"),
  resetMessage: document.getElementById("resetMessage"),
};

// 앱이 시작될 때 저장된 데이터를 읽고 화면을 그립니다.
function initializeApp() {
  loadData();
  bindEvents();
  renderApp();
}

// localStorage에서 팀과 경기 데이터를 읽습니다.
function loadData() {
  const savedTeams = localStorage.getItem(STORAGE_KEYS.teams);
  const savedMatches = localStorage.getItem(STORAGE_KEYS.matches);

  state.teams = parseTeams(savedTeams);
  state.matches = parseMatches(savedMatches);
}

// 현재 상태를 localStorage에 저장합니다.
function saveData() {
  localStorage.setItem(STORAGE_KEYS.teams, JSON.stringify(state.teams));
  localStorage.setItem(STORAGE_KEYS.matches, JSON.stringify(state.matches));
}

// 팀 배열은 문자열 목록만 허용합니다.
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

// 경기 배열은 필요한 필드가 있는 객체만 복원합니다.
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
          match.isPlayed && Number.isInteger(match.scoreA) && match.scoreA >= 0 && Number.isInteger(match.scoreB) && match.scoreB >= 0,
      }));
  } catch (error) {
    console.error("경기 데이터 복원 중 오류가 발생했습니다.", error);
    return [];
  }
}

// 폼과 버튼 이벤트를 연결합니다.
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

  elements.matchesContainer.addEventListener("submit", (event) => {
    const form = event.target.closest("form[data-match-id]");

    if (!form) {
      return;
    }

    event.preventDefault();

    const matchId = form.dataset.matchId;
    const formData = new FormData(form);

    updateMatch(matchId, formData.get("scoreA"), formData.get("scoreB"));
  });

  elements.matchesContainer.addEventListener("click", (event) => {
    const clearButton = event.target.closest("button[data-clear-match-id]");

    if (!clearButton) {
      return;
    }

    clearMatchResult(clearButton.dataset.clearMatchId);
  });
}

// 팀을 추가합니다.
function addTeam(rawTeamName) {
  clearMessage(elements.resetMessage);
  clearMessage(elements.matchGenerationMessage);

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

// 경기 일정이 없을 때만 팀을 삭제할 수 있습니다.
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

// 등록된 팀들로 단일 풀리그 경기 목록을 생성합니다.
function generateMatches() {
  clearMessage(elements.teamMessage);
  clearMessage(elements.resetMessage);

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
    `총 ${createdMatches.length}경기의 단일 풀리그 일정이 생성되었습니다. 이제 점수를 입력해 주세요.`,
    "success"
  );
}

// 특정 경기의 점수를 저장하고 결과를 반영합니다.
function updateMatch(matchId, rawScoreA, rawScoreB) {
  const match = state.matches.find((item) => item.id === matchId);

  if (!match) {
    return;
  }

  const scoreA = normalizeScore(rawScoreA);
  const scoreB = normalizeScore(rawScoreB);

  if (scoreA === null || scoreB === null) {
    setMatchMessage(matchId, "점수는 0 이상의 정수만 저장할 수 있습니다.");
    return;
  }

  match.scoreA = scoreA;
  match.scoreB = scoreB;
  match.isPlayed = true;

  saveData();
  renderApp();
  setMatchMessage(matchId, "결과를 저장했습니다. 순위표가 즉시 갱신되었습니다.", "success");
}

// 저장된 경기 결과를 비워서 미입력 상태로 되돌립니다.
function clearMatchResult(matchId) {
  const match = state.matches.find((item) => item.id === matchId);

  if (!match) {
    return;
  }

  match.scoreA = null;
  match.scoreB = null;
  match.isPlayed = false;

  saveData();
  renderApp();
  setMatchMessage(matchId, "경기 결과를 초기화했습니다. 순위표를 다시 계산했습니다.", "success");
}

// 입력 완료된 경기만 집계해서 순위표용 데이터를 만듭니다.
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

// 상단 요약 카드를 그립니다.
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

// 팀 목록을 화면에 표시합니다.
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

// 경기 목록과 입력 폼을 그립니다.
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

  state.matches.forEach((match, index) => {
    const matchCard = document.createElement("article");
    matchCard.className = `match-card ${match.isPlayed ? "played" : "pending"}`;
    matchCard.dataset.matchCardId = match.id;

    const statusLabel = match.isPlayed ? "입력 완료" : "미입력";
    const statusClass = match.isPlayed ? "played" : "pending";

    matchCard.innerHTML = `
      <div class="match-top">
        <div>
          <p class="match-title">${index + 1}경기 · ${escapeHtml(match.teamA)} vs ${escapeHtml(match.teamB)}</p>
        </div>
        <span class="match-status ${statusClass}">${statusLabel}</span>
      </div>
      <form class="match-form" data-match-id="${match.id}" novalidate>
        <div class="score-inputs">
          <label>
            <span class="team-label">${escapeHtml(match.teamA)}</span>
            <input type="number" name="scoreA" min="0" step="1" inputmode="numeric" value="${formatScoreValue(match.scoreA)}" placeholder="0" />
          </label>
          <div class="score-divider">:</div>
          <label>
            <span class="team-label">${escapeHtml(match.teamB)}</span>
            <input type="number" name="scoreB" min="0" step="1" inputmode="numeric" value="${formatScoreValue(match.scoreB)}" placeholder="0" />
          </label>
        </div>
        <div class="match-actions">
          <button class="primary-button" type="submit">결과 저장</button>
          <button class="secondary-button" type="button" data-clear-match-id="${match.id}" ${match.isPlayed ? "" : "disabled"}>결과 초기화</button>
        </div>
      </form>
      <p class="match-detail" data-match-message-id="${match.id}">${escapeHtml(buildMatchDescription(match))}</p>
    `;

    elements.matchesContainer.appendChild(matchCard);
  });
}

// 계산된 순위표를 테이블에 표시합니다.
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

// 앱 전체 화면을 다시 그립니다.
function renderApp() {
  renderSummary();
  renderTeams();
  renderMatches();
  renderStandings();
  updateButtonStates();
}

// 버튼 상태를 현재 데이터 흐름에 맞게 맞춥니다.
function updateButtonStates() {
  elements.generateMatchesButton.disabled = state.teams.length < 2 || state.matches.length > 0;
}

// 전체 데이터를 지우고 빈 상태로 되돌립니다.
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

  localStorage.removeItem(STORAGE_KEYS.teams);
  localStorage.removeItem(STORAGE_KEYS.matches);

  clearMessage(elements.teamMessage);
  clearMessage(elements.matchGenerationMessage);
  renderApp();

  setMessage(elements.resetMessage, "모든 데이터를 초기화했습니다. 빈 상태에서 다시 시작할 수 있습니다.", "success");
}

// 경기 고유 아이디를 만들 때 사용하는 유틸 함수입니다.
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

// 숫자 입력을 0 이상의 정수인지 검사한 뒤 숫자로 바꿉니다.
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

// 경기 카드 하단에 현재 결과 상태를 설명해 줍니다.
function buildMatchDescription(match) {
  if (!match.isPlayed) {
    return "점수를 입력하고 결과 저장 버튼을 누르면 순위표가 자동으로 반영됩니다.";
  }

  if (match.scoreA > match.scoreB) {
    return `${match.teamA} 승리 · ${match.scoreA}득점 ${match.scoreB}실점 / ${match.teamB} 패배`;
  }

  if (match.scoreA < match.scoreB) {
    return `${match.teamB} 승리 · ${match.scoreB}득점 ${match.scoreA}실점 / ${match.teamA} 패배`;
  }

  return `무승부 · ${match.teamA} ${match.scoreA} : ${match.scoreB} ${match.teamB}`;
}

// 점수가 없으면 빈칸으로 표시합니다.
function formatScoreValue(score) {
  return Number.isInteger(score) ? String(score) : "";
}

// 섹션별 안내 메시지를 표시합니다.
function setMessage(element, message, tone = "warning") {
  element.textContent = message;
  element.dataset.tone = tone;
}

function clearMessage(element) {
  element.textContent = "";
  delete element.dataset.tone;
}

// 경기 카드 내부 메시지를 바꿉니다.
function setMatchMessage(matchId, message, tone = "warning") {
  const messageElement = document.querySelector(`[data-match-message-id="${matchId}"]`);

  if (!messageElement) {
    return;
  }

  messageElement.textContent = message;
  messageElement.style.color = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--warning)";
}

// 빈 상태 UI를 공통으로 만들기 위한 함수입니다.
function createEmptyState(title, description) {
  const emptyState = document.createElement("article");
  emptyState.className = "empty-state";
  emptyState.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(description)}</p>
  `;
  return emptyState;
}

// innerHTML에 텍스트를 넣기 전 간단히 이스케이프합니다.
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

initializeApp();
