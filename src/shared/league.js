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

export function findMatchById(matches, matchId) {
  return matches.find((match) => match.id === matchId) || null;
}

export function findMatchByTeams(matches, teamAId, teamBId) {
  return (
    matches.find(
      (match) =>
        (match.teamAId === teamAId && match.teamBId === teamBId) ||
        (match.teamAId === teamBId && match.teamBId === teamAId)
    ) || null
  );
}

export function normalizeScore(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmedValue = String(value).trim();

  if (trimmedValue === "" || !/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsed = Number(trimmedValue);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function formatScoreValue(score) {
  return Number.isInteger(score) ? String(score) : "";
}

export function getSummaryCards(teams, matches) {
  const playedMatches = matches.filter((match) => match.isPlayed).length;
  const totalMatches = matches.length;

  return [
    { label: "총 팀 수", value: teams.length, note: "" },
    { label: "총 경기 수", value: totalMatches, note: "" },
    { label: "입력 완료 경기 수", value: playedMatches, note: "" },
    { label: "남은 경기 수", value: Math.max(totalMatches - playedMatches, 0), note: "" },
  ];
}

export function formatMatchScoreForTeams(match, leftTeamId, rightTeamId, pendingLabel = "입력") {
  if (!match.isPlayed) {
    return pendingLabel;
  }

  if (match.teamAId === leftTeamId && match.teamBId === rightTeamId) {
    return `${match.scoreA} : ${match.scoreB}`;
  }

  return `${match.scoreB} : ${match.scoreA}`;
}

export function getMatchOutcomeForTeam(match, teamId) {
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

export function getOutcomeLabel(match, teamId, pendingLabel = "입력") {
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

export function formatFileSize(sizeInBytes) {
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
