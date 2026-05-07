export function normalizeLeagueData(teamRows = [], matchRows = []) {
  const teams = [...teamRows]
    .map((team, index) => ({
      id: String(team.id),
      name: String(team.name || "").trim(),
      displayOrder: Number.isInteger(team.display_order) ? team.display_order : index,
      createdAt: team.created_at || null,
    }))
    .filter((team) => team.name !== "")
    .sort(compareTeams);

  const teamMap = new Map(teams.map((team) => [team.id, team]));

  const matches = matchRows
    .map((match) => {
      const rawTeamA = teamMap.get(String(match.team_a_id));
      const rawTeamB = teamMap.get(String(match.team_b_id));

      if (!rawTeamA || !rawTeamB) {
        return null;
      }

      const shouldSwap = compareTeams(rawTeamA, rawTeamB) > 0;
      const sourceScoreA = Number.isInteger(match.score_a) ? match.score_a : null;
      const sourceScoreB = Number.isInteger(match.score_b) ? match.score_b : null;
      const isPlayed = Boolean(match.is_played) && sourceScoreA !== null && sourceScoreB !== null;

      return {
        id: String(match.id),
        teamAId: shouldSwap ? rawTeamB.id : rawTeamA.id,
        teamBId: shouldSwap ? rawTeamA.id : rawTeamB.id,
        teamA: shouldSwap ? rawTeamB.name : rawTeamA.name,
        teamB: shouldSwap ? rawTeamA.name : rawTeamB.name,
        teamAOrder: shouldSwap ? rawTeamB.displayOrder : rawTeamA.displayOrder,
        teamBOrder: shouldSwap ? rawTeamA.displayOrder : rawTeamB.displayOrder,
        scoreA: isPlayed ? (shouldSwap ? sourceScoreB : sourceScoreA) : null,
        scoreB: isPlayed ? (shouldSwap ? sourceScoreA : sourceScoreB) : null,
        isPlayed,
        createdAt: match.created_at || null,
      };
    })
    .filter(Boolean)
    .sort(compareMatches);

  return { teams, matches };
}

export function calculateStandings(teams, matches) {
  const standingsMap = new Map();

  teams.forEach((team, index) => {
    standingsMap.set(team.id, {
      order: index,
      team: team.name,
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

  matches.forEach((match) => {
    if (!match.isPlayed) {
      return;
    }

    const teamAStats = standingsMap.get(match.teamAId);
    const teamBStats = standingsMap.get(match.teamBId);

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

  return Array.from(standingsMap.values())
    .map((row) => ({
      ...row,
      goalDiff: row.goalsFor - row.goalsAgainst,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }

      if (b.goalDiff !== a.goalDiff) {
        return b.goalDiff - a.goalDiff;
      }

      return a.order - b.order;
    });
}

export function renderSummary(container, teams, matches) {
  const playedMatches = matches.filter((match) => match.isPlayed).length;
  const totalMatches = matches.length;
  const remainingMatches = Math.max(totalMatches - playedMatches, 0);

  const cardData = [
    { label: "총 팀 수", value: teams.length, note: "" },
    { label: "총 경기 수", value: totalMatches, note: "" },
    { label: "입력 완료 경기 수", value: playedMatches, note: "" },
    { label: "남은 경기 수", value: remainingMatches, note: "" },
  ];

  container.innerHTML = "";

  cardData.forEach((card) => {
    const cardElement = document.createElement("article");
    cardElement.className = "summary-card";
    cardElement.innerHTML = `
      <span class="summary-label">${escapeHtml(card.label)}</span>
      <strong class="summary-value">${escapeHtml(String(card.value))}</strong>
      <span class="summary-note">${escapeHtml(card.note)}</span>
    `;
    container.appendChild(cardElement);
  });
}

export function renderTeams(
  container,
  teams,
  { showRemoveButton = false, disableRemoveButton = false } = {}
) {
  container.innerHTML = "";

  if (teams.length === 0) {
    container.appendChild(
      createEmptyState(
        "아직 등록된 팀이 없습니다.",
        "관리자 인증 후 먼저 팀을 등록한 뒤 경기 일정을 생성하세요."
      )
    );
    return;
  }

  teams.forEach((team, index) => {
    const teamItem = document.createElement("article");
    teamItem.className = "team-item";

    const meta = document.createElement("div");
    meta.className = "team-meta";

    const head = document.createElement("div");
    head.className = "team-head";

    const badge = document.createElement("span");
    badge.className = "team-index-chip";
    badge.textContent = String(index + 1);

    const name = document.createElement("strong");
    name.className = "team-name";
    name.textContent = team.name;

    head.append(badge, name);
    meta.append(head);
    teamItem.append(meta);

    if (showRemoveButton) {
      const removeButton = document.createElement("button");
      removeButton.className = "secondary-button";
      removeButton.type = "button";
      removeButton.dataset.teamId = team.id;
      removeButton.textContent = "삭제";
      removeButton.disabled = disableRemoveButton;
      teamItem.append(removeButton);
    }

    container.appendChild(teamItem);
  });
}

export function renderMatches(
  container,
  teams,
  matches,
  { editable = false, pendingLabel = "입력" } = {}
) {
  container.innerHTML = "";

  if (matches.length === 0) {
    container.appendChild(
      createEmptyState(
        "아직 생성된 경기가 없습니다.",
        "팀을 2개 이상 등록한 뒤 경기 생성 버튼을 눌러 일정 목록을 만드세요."
      )
    );
    return;
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap matrix-table-wrap";

  const table = document.createElement("table");
  table.className = "matches-table matrix-table";

  const caption = document.createElement("caption");
  caption.className = "sr-only";
  caption.textContent = editable
    ? "팀 간 대진 교차표입니다. 클릭 가능한 셀에서 점수 입력 또는 수정 모달이 열립니다."
    : "팀 간 대진 교차표입니다. 보기 전용으로 최신 경기 결과만 표시합니다.";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const cornerCell = document.createElement("th");
  cornerCell.className = "matrix-corner";
  cornerCell.scope = "col";
  cornerCell.innerHTML = `
    <span class="matrix-corner-label">대진표</span>
    <span class="matrix-corner-note">행 팀 vs 열 팀</span>
  `;
  headRow.appendChild(cornerCell);

  teams.forEach((team, index) => {
    const headCell = document.createElement("th");
    headCell.scope = "col";
    headCell.className = "matrix-team-head";
    headCell.innerHTML = `
      <span class="team-index-badge">${index + 1}</span>
      <span class="matrix-team-name" title="${escapeHtml(team.name)}">${escapeHtml(team.name)}</span>
    `;
    headRow.appendChild(headCell);
  });

  thead.appendChild(headRow);
  table.append(caption, thead);

  const tbody = document.createElement("tbody");

  teams.forEach((rowTeam, rowIndex) => {
    const row = document.createElement("tr");

    const sideHead = document.createElement("th");
    sideHead.scope = "row";
    sideHead.className = "matrix-side-head";
    sideHead.innerHTML = `
      <span class="team-index-badge">${rowIndex + 1}</span>
      <span class="matrix-team-name" title="${escapeHtml(rowTeam.name)}">${escapeHtml(rowTeam.name)}</span>
    `;
    row.appendChild(sideHead);

    teams.forEach((columnTeam, columnIndex) => {
      const cell = document.createElement("td");

      if (rowIndex === columnIndex) {
        cell.className = "matrix-diagonal";
        cell.setAttribute("aria-hidden", "true");
        row.appendChild(cell);
        return;
      }

      const match = findMatchByTeams(matches, rowTeam.id, columnTeam.id);

      if (!match) {
        cell.className = "matrix-muted";
        row.appendChild(cell);
        return;
      }

      const outcomeClass = getMatchOutcomeForTeam(match, rowTeam.id);
      const isInteractiveCell = editable && columnIndex > rowIndex;

      if (!isInteractiveCell) {
        cell.className = `matrix-match-cell readonly ${outcomeClass}`;
        cell.innerHTML = `
          <div class="matrix-cell-display ${outcomeClass}">
            <span class="matrix-cell-score">${escapeHtml(
              formatMatchScoreForTeams(match, rowTeam.id, columnTeam.id, pendingLabel)
            )}</span>
            <span class="matrix-cell-state">${getOutcomeLabel(match, rowTeam.id, pendingLabel)}</span>
          </div>
        `;
        row.appendChild(cell);
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = `matrix-cell-button ${outcomeClass}`;
      button.dataset.openMatchId = match.id;
      button.setAttribute(
        "aria-label",
        `${rowTeam.name} 대 ${columnTeam.name} 경기 ${
          match.isPlayed
            ? `${formatMatchScoreForTeams(match, rowTeam.id, columnTeam.id)} 수정`
            : "점수 입력"
        }`
      );
      button.innerHTML = `
        <span class="matrix-cell-score">${escapeHtml(
          formatMatchScoreForTeams(match, rowTeam.id, columnTeam.id, pendingLabel)
        )}</span>
        <span class="matrix-cell-state">${getOutcomeLabel(match, rowTeam.id, pendingLabel)}</span>
      `;

      cell.className = `matrix-match-cell ${outcomeClass}`;
      cell.appendChild(button);
      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  container.appendChild(tableWrap);
}

export function renderStandings(tbody, teams, matches) {
  tbody.innerHTML = "";

  if (teams.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="10">팀을 등록하면 순위표가 이곳에 표시됩니다.</td>';
    tbody.appendChild(row);
    return;
  }

  const standings = calculateStandings(teams, matches);

  standings.forEach((teamStats, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(teamStats.team)}</td>
      <td>${teamStats.played}</td>
      <td>${teamStats.points}</td>
      <td>${teamStats.wins}</td>
      <td>${teamStats.draws}</td>
      <td>${teamStats.losses}</td>
      <td>${teamStats.goalsFor}</td>
      <td>${teamStats.goalsAgainst}</td>
      <td>${teamStats.goalDiff}</td>
    `;
    tbody.appendChild(row);
  });
}

export function findMatchById(matches, matchId) {
  return matches.find((match) => match.id === matchId) || null;
}

export function normalizeScore(value) {
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

export function formatScoreValue(score) {
  return Number.isInteger(score) ? String(score) : "";
}

export function setMessage(element, message, tone = "warning") {
  element.textContent = message;
  element.dataset.tone = tone;
}

export function clearMessage(element) {
  element.textContent = "";
  delete element.dataset.tone;
}

export function createEmptyState(title, description) {
  const emptyState = document.createElement("article");
  emptyState.className = "empty-state";
  emptyState.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(description)}</p>
  `;
  return emptyState;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function findMatchByTeams(matches, teamAId, teamBId) {
  return (
    matches.find(
      (match) =>
        (match.teamAId === teamAId && match.teamBId === teamBId) ||
        (match.teamAId === teamBId && match.teamBId === teamAId)
    ) || null
  );
}

function compareMatches(a, b) {
  if (a.teamAOrder !== b.teamAOrder) {
    return a.teamAOrder - b.teamAOrder;
  }

  if (a.teamBOrder !== b.teamBOrder) {
    return a.teamBOrder - b.teamBOrder;
  }

  const teamComparison = a.teamA.localeCompare(b.teamA, "ko");

  if (teamComparison !== 0) {
    return teamComparison;
  }

  return a.id.localeCompare(b.id, "en");
}

function compareTeams(a, b) {
  if (a.displayOrder !== b.displayOrder) {
    return a.displayOrder - b.displayOrder;
  }

  if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
    return a.createdAt.localeCompare(b.createdAt, "en");
  }

  const nameComparison = a.name.localeCompare(b.name, "ko");

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return a.id.localeCompare(b.id, "en");
}

function formatMatchScoreForTeams(match, leftTeamId, rightTeamId, pendingLabel = "입력") {
  if (!match.isPlayed) {
    return pendingLabel;
  }

  if (match.teamAId === leftTeamId && match.teamBId === rightTeamId) {
    return `${match.scoreA} : ${match.scoreB}`;
  }

  return `${match.scoreB} : ${match.scoreA}`;
}

function getMatchOutcomeForTeam(match, teamId) {
  if (!match.isPlayed) {
    return "pending";
  }

  const teamScore = match.teamAId === teamId ? match.scoreA : match.scoreB;
  const opponentScore = match.teamAId === teamId ? match.scoreB : match.scoreA;

  if (teamScore > opponentScore) {
    return "win";
  }

  if (teamScore < opponentScore) {
    return "loss";
  }

  return "draw";
}

function getOutcomeLabel(match, teamId, pendingLabel = "입력") {
  const outcome = getMatchOutcomeForTeam(match, teamId);

  if (outcome === "win") {
    return "승";
  }

  if (outcome === "loss") {
    return "패";
  }

  if (outcome === "draw") {
    return "무";
  }

  return pendingLabel;
}
