/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   player1Name: string;
 *   player2Name: string;
 * }} Team
 *
 * @typedef {"A" | "B"} GroupId
 *
 * @typedef {{
 *   id: GroupId;
 *   name: string;
 *   teams: Team[];
 * }} Group
 *
 * @typedef {"pending" | "completed"} MatchStatus
 *
 * @typedef {{
 *   id: string;
 *   groupId: GroupId;
 *   team1: Team;
 *   team2: Team;
 *   team1Score: number | null;
 *   team2Score: number | null;
 *   winnerTeamId: string | null;
 *   status: MatchStatus;
 * }} PreliminaryMatch
 *
 * @typedef {{
 *   team: Team;
 *   played: number;
 *   wins: number;
 *   losses: number;
 *   pointsFor: number;
 *   pointsAgainst: number;
 *   pointDiff: number;
 *   rank: number | null;
 *   needsTiebreakReview?: boolean;
 * }} StandingRow
 *
 * @typedef {"quarterfinal" | "semifinal" | "final"} TournamentRoundId
 *
 * @typedef {
 *   | "A1"
 *   | "A2"
 *   | "A3"
 *   | "B1"
 *   | "B2"
 *   | "B3"
 *   | "W_QF1"
 *   | "W_QF2"
 *   | "W_SF1"
 *   | "W_SF2"
 *   | "L_SF1"
 *   | "L_SF2"
 *   | "TBD"
 * } TournamentSlot
 *
 * @typedef {{
 *   id: string;
 *   round: TournamentRoundId;
 *   name: string;
 *   team1Slot: TournamentSlot;
 *   team2Slot: TournamentSlot;
 *   team1: Team | null;
 *   team2: Team | null;
 *   team1Score: number | null;
 *   team2Score: number | null;
 *   winnerTeamId: string | null;
 *   status: MatchStatus;
 *   nextMatchId: string | null;
 * }} TournamentMatch
 */

export function validateLeagueTournamentInput(tournamentName, teams) {
  const errors = [];
  const warnings = [];
  const trimmedTournamentName = String(tournamentName || "").trim();

  if (!trimmedTournamentName) {
    errors.push("대회명을 입력해 주세요.");
  }

  if (!Array.isArray(teams) || teams.length !== 6) {
    errors.push("복식 팀은 정확히 6개여야 합니다.");
  }

  const teamNameCounts = new Map();
  const playerNameCounts = new Map();

  (Array.isArray(teams) ? teams : []).forEach((team, index) => {
    const label = `팀 ${index + 1}`;
    const teamName = String(team?.name || "").trim();
    const player1Name = String(team?.player1Name || "").trim();
    const player2Name = String(team?.player2Name || "").trim();

    if (!teamName) {
      errors.push(`${label}의 팀명을 입력해 주세요.`);
    } else {
      teamNameCounts.set(teamName, (teamNameCounts.get(teamName) || 0) + 1);
    }

    if (!player1Name) {
      errors.push(`${label}의 선수 1 이름을 입력해 주세요.`);
    }

    if (!player2Name) {
      errors.push(`${label}의 선수 2 이름을 입력해 주세요.`);
    }

    if (player1Name && player2Name && player1Name === player2Name) {
      errors.push(`${label}의 선수 1과 선수 2 이름이 같습니다.`);
    }

    [player1Name, player2Name].filter(Boolean).forEach((playerName) => {
      playerNameCounts.set(playerName, (playerNameCounts.get(playerName) || 0) + 1);
    });
  });

  const duplicateTeamNames = Array.from(teamNameCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  if (duplicateTeamNames.length > 0) {
    errors.push(`팀명이 중복되었습니다: ${duplicateTeamNames.join(", ")}`);
  }

  const duplicatePlayerNames = Array.from(playerNameCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  if (duplicatePlayerNames.length > 0) {
    warnings.push(`선수 이름이 중복되었습니다: ${duplicatePlayerNames.join(", ")}. 동명이인인지 확인해주세요.`);
  }

  return {
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}

export function createTwoGroups(teams) {
  if (!Array.isArray(teams) || teams.length !== 6) {
    throw new Error("createTwoGroups는 정확히 6개의 팀이 필요합니다.");
  }

  return [
    {
      id: "A",
      name: "A조",
      teams: teams.slice(0, 3),
    },
    {
      id: "B",
      name: "B조",
      teams: teams.slice(3, 6),
    },
  ];
}

export function generateThreeTeamRoundRobinMatches(group) {
  if (!group || !Array.isArray(group.teams) || group.teams.length !== 3) {
    throw new Error("3팀 풀리그 경기 생성에는 정확히 3개 팀이 필요합니다.");
  }

  const [team1, team2, team3] = group.teams;
  const pairings = [
    [team1, team2],
    [team1, team3],
    [team2, team3],
  ];

  return pairings.map(([leftTeam, rightTeam], index) => ({
    id: `${group.id}-preliminary-${index + 1}`,
    groupId: group.id,
    team1: leftTeam,
    team2: rightTeam,
    team1Score: null,
    team2Score: null,
    winnerTeamId: null,
    status: "pending",
  }));
}

export function calculateGroupStandings(group, matches) {
  if (!group || !Array.isArray(group.teams)) {
    return [];
  }

  const groupMatches = (Array.isArray(matches) ? matches : []).filter(
    (match) => match.groupId === group.id
  );
  const standingsMap = new Map();

  group.teams.forEach((team) => {
    standingsMap.set(team.id, {
      team,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      rank: null,
      needsTiebreakReview: false,
    });
  });

  groupMatches.forEach((match) => {
    if (match.status !== "completed" || !Number.isInteger(match.team1Score) || !Number.isInteger(match.team2Score)) {
      return;
    }

    const team1Row = standingsMap.get(match.team1.id);
    const team2Row = standingsMap.get(match.team2.id);

    if (!team1Row || !team2Row) {
      return;
    }

    team1Row.played += 1;
    team2Row.played += 1;
    team1Row.pointsFor += match.team1Score;
    team1Row.pointsAgainst += match.team2Score;
    team2Row.pointsFor += match.team2Score;
    team2Row.pointsAgainst += match.team1Score;

    if (match.team1Score > match.team2Score) {
      team1Row.wins += 1;
      team2Row.losses += 1;
    } else {
      team2Row.wins += 1;
      team1Row.losses += 1;
    }
  });

  const rows = Array.from(standingsMap.values()).map((row) => ({
    ...row,
    pointDiff: row.pointsFor - row.pointsAgainst,
  }));
  const allMatchesCompleted = groupMatches.length === 3 && groupMatches.every(
    (match) => match.status === "completed"
  );

  if (!allMatchesCompleted) {
    return rows;
  }

  const sorted = [...rows].sort(compareStandingBase);
  const rankedRows = [];
  let nextRank = 1;

  for (let index = 0; index < sorted.length;) {
    const tiedRows = [sorted[index]];
    let nextIndex = index + 1;

    while (
      nextIndex < sorted.length &&
      hasSameStandingBase(sorted[index], sorted[nextIndex])
    ) {
      tiedRows.push(sorted[nextIndex]);
      nextIndex += 1;
    }

    if (tiedRows.length === 1) {
      rankedRows.push({ ...tiedRows[0], rank: nextRank });
    } else if (tiedRows.length === 2) {
      const orderedByHeadToHead = orderTwoTeamTieByHeadToHead(tiedRows, groupMatches);

      if (orderedByHeadToHead) {
        rankedRows.push(
          { ...orderedByHeadToHead[0], rank: nextRank },
          { ...orderedByHeadToHead[1], rank: nextRank + 1 }
        );
      } else {
        tiedRows.forEach((row) => {
          rankedRows.push({ ...row, rank: null, needsTiebreakReview: true });
        });
      }
    } else {
      tiedRows.forEach((row) => {
        rankedRows.push({ ...row, rank: null, needsTiebreakReview: true });
      });
    }

    nextRank += tiedRows.length;
    index = nextIndex;
  }

  return rankedRows.sort((left, right) => {
    if (left.rank === null && right.rank === null) {
      return compareStandingBase(left, right);
    }

    if (left.rank === null) {
      return 1;
    }

    if (right.rank === null) {
      return -1;
    }

    return left.rank - right.rank;
  });
}

export function generateSixTeamTournamentBracket(groupAStandings, groupBStandings) {
  const slotMap = buildTournamentSlotMap(groupAStandings, groupBStandings);

  return [
    createTournamentMatch({
      id: "qf-1",
      round: "quarterfinal",
      name: "6강 1경기",
      team1Slot: "A2",
      team2Slot: "B3",
      team1: slotMap.A2 || null,
      team2: slotMap.B3 || null,
      nextMatchId: "sf-1",
    }),
    createTournamentMatch({
      id: "qf-2",
      round: "quarterfinal",
      name: "6강 2경기",
      team1Slot: "B2",
      team2Slot: "A3",
      team1: slotMap.B2 || null,
      team2: slotMap.A3 || null,
      nextMatchId: "sf-2",
    }),
    createTournamentMatch({
      id: "sf-1",
      round: "semifinal",
      name: "4강 1경기",
      team1Slot: "B1",
      team2Slot: "W_QF1",
      team1: slotMap.B1 || null,
      team2: null,
      nextMatchId: "final",
    }),
    createTournamentMatch({
      id: "sf-2",
      round: "semifinal",
      name: "4강 2경기",
      team1Slot: "A1",
      team2Slot: "W_QF2",
      team1: slotMap.A1 || null,
      team2: null,
      nextMatchId: "final",
    }),
    createTournamentMatch({
      id: "final",
      round: "final",
      name: "결승",
      team1Slot: "W_SF1",
      team2Slot: "W_SF2",
      team1: null,
      team2: null,
      nextMatchId: null,
    }),
    createTournamentMatch({
      id: "third-place",
      round: "final",
      name: "3·4위전",
      team1Slot: "L_SF1",
      team2Slot: "L_SF2",
      team1: null,
      team2: null,
      nextMatchId: null,
    }),
  ];
}

export function updateTournamentWinner(matches, matchId, team1Score, team2Score) {
  if (!Number.isInteger(team1Score) || team1Score < 0 || !Number.isInteger(team2Score) || team2Score < 0) {
    throw new Error("점수는 0 이상의 정수만 입력할 수 있습니다.");
  }

  if (team1Score === team2Score) {
    throw new Error("토너먼트 경기는 동점을 허용하지 않습니다.");
  }

  const nextMatches = matches.map((match) => ({
    ...match,
  }));
  const matchMap = new Map(nextMatches.map((match) => [match.id, match]));
  const targetMatch = matchMap.get(matchId);

  if (!targetMatch) {
    throw new Error("선택한 토너먼트 경기를 찾을 수 없습니다.");
  }

  if (!targetMatch.team1 || !targetMatch.team2) {
    throw new Error("두 팀이 모두 확정된 경기만 점수를 반영할 수 있습니다.");
  }

  const previousWinnerTeamId = targetMatch.winnerTeamId;
  const winner = team1Score > team2Score ? targetMatch.team1 : targetMatch.team2;
  const loser = team1Score > team2Score ? targetMatch.team2 : targetMatch.team1;
  const previousLoserTeamId = getCompletedLoser(targetMatch)?.id || null;

  targetMatch.team1Score = team1Score;
  targetMatch.team2Score = team2Score;
  targetMatch.winnerTeamId = winner.id;
  targetMatch.status = "completed";

  if (targetMatch.nextMatchId) {
    propagateWinnerToNextMatch(matchMap, targetMatch, winner, previousWinnerTeamId !== winner.id);
  }

  propagateLoserToThirdPlace(matchMap, targetMatch, loser, previousLoserTeamId !== loser.id);

  return nextMatches;
}

export function normalizeLeagueTournamentScore(value) {
  const trimmedValue = String(value ?? "").trim();

  if (trimmedValue === "") {
    return null;
  }

  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : null;
}

export function areStandingsFinal(standings) {
  return (
    Array.isArray(standings) &&
    standings.length === 3 &&
    standings.every((row) => row.rank !== null && !row.needsTiebreakReview)
  );
}

export function findChampion(matches) {
  const finalMatch = matches.find((match) => match.id === "final");

  if (!finalMatch || finalMatch.status !== "completed" || !finalMatch.winnerTeamId) {
    return null;
  }

  return [finalMatch.team1, finalMatch.team2].find((team) => team?.id === finalMatch.winnerTeamId) || null;
}

export function calculateFinalRankings(matches) {
  const finalMatch = matches.find((match) => match.id === "final");
  const thirdPlaceMatch = matches.find((match) => match.id === "third-place");
  const finalWinner = getCompletedWinner(finalMatch);
  const finalLoser = getCompletedLoser(finalMatch);
  const thirdPlaceWinner = getCompletedWinner(thirdPlaceMatch);
  const thirdPlaceLoser = getCompletedLoser(thirdPlaceMatch);

  return [
    { rank: 1, label: "1위", team: finalWinner },
    { rank: 2, label: "2위", team: finalLoser },
    { rank: 3, label: "3위", team: thirdPlaceWinner },
    { rank: 4, label: "4위", team: thirdPlaceLoser },
  ];
}

export function areFinalRankingsComplete(matches) {
  return calculateFinalRankings(matches).every((row) => row.team);
}

function createTournamentMatch({
  id,
  round,
  name,
  team1Slot,
  team2Slot,
  team1,
  team2,
  nextMatchId,
}) {
  return {
    id,
    round,
    name,
    team1Slot,
    team2Slot,
    team1,
    team2,
    team1Score: null,
    team2Score: null,
    winnerTeamId: null,
    status: "pending",
    nextMatchId,
  };
}

function buildTournamentSlotMap(groupAStandings, groupBStandings) {
  const slotMap = {};

  if (!areStandingsFinal(groupAStandings) || !areStandingsFinal(groupBStandings)) {
    return slotMap;
  }

  groupAStandings.forEach((row) => {
    slotMap[`A${row.rank}`] = row.team;
  });

  groupBStandings.forEach((row) => {
    slotMap[`B${row.rank}`] = row.team;
  });

  return slotMap;
}

function compareStandingBase(left, right) {
  if (right.wins !== left.wins) {
    return right.wins - left.wins;
  }

  if (right.pointDiff !== left.pointDiff) {
    return right.pointDiff - left.pointDiff;
  }

  if (right.pointsFor !== left.pointsFor) {
    return right.pointsFor - left.pointsFor;
  }

  return 0;
}

function hasSameStandingBase(left, right) {
  return (
    left.wins === right.wins &&
    left.pointDiff === right.pointDiff &&
    left.pointsFor === right.pointsFor
  );
}

function orderTwoTeamTieByHeadToHead(tiedRows, matches) {
  const [left, right] = tiedRows;
  const headToHeadMatch = matches.find(
    (match) =>
      (match.team1.id === left.team.id && match.team2.id === right.team.id) ||
      (match.team1.id === right.team.id && match.team2.id === left.team.id)
  );

  if (!headToHeadMatch?.winnerTeamId) {
    return null;
  }

  if (headToHeadMatch.winnerTeamId === left.team.id) {
    return [left, right];
  }

  if (headToHeadMatch.winnerTeamId === right.team.id) {
    return [right, left];
  }

  return null;
}

function propagateWinnerToNextMatch(matchMap, sourceMatch, winner, shouldClearDownstream) {
  const nextMatch = matchMap.get(sourceMatch.nextMatchId);

  if (!nextMatch) {
    return;
  }

  const targetSide = getNextMatchTargetSide(sourceMatch.id);

  if (!targetSide) {
    return;
  }

  if (shouldClearDownstream) {
    clearMatchResultAndDownstream(matchMap, nextMatch);
  }

  nextMatch[targetSide] = winner;
}

function propagateLoserToThirdPlace(matchMap, sourceMatch, loser, shouldClearDownstream) {
  const targetSide = getThirdPlaceMatchTargetSide(sourceMatch.id);

  if (!targetSide) {
    return;
  }

  const thirdPlaceMatch = matchMap.get("third-place");

  if (!thirdPlaceMatch) {
    return;
  }

  if (shouldClearDownstream) {
    clearMatchResultAndDownstream(matchMap, thirdPlaceMatch);
  }

  thirdPlaceMatch[targetSide] = loser;
}

function clearMatchResultAndDownstream(matchMap, match) {
  const oldWinnerTeamId = match.winnerTeamId;
  const thirdPlaceTargetSide = getThirdPlaceMatchTargetSide(match.id);

  match.team1Score = null;
  match.team2Score = null;
  match.winnerTeamId = null;
  match.status = "pending";

  if (thirdPlaceTargetSide) {
    const thirdPlaceMatch = matchMap.get("third-place");

    if (thirdPlaceMatch) {
      thirdPlaceMatch[thirdPlaceTargetSide] = null;
      clearMatchResultAndDownstream(matchMap, thirdPlaceMatch);
    }
  }

  if (!match.nextMatchId || !oldWinnerTeamId) {
    return;
  }

  const nextMatch = matchMap.get(match.nextMatchId);
  const targetSide = getNextMatchTargetSide(match.id);

  if (!nextMatch || !targetSide) {
    return;
  }

  nextMatch[targetSide] = null;
  clearMatchResultAndDownstream(matchMap, nextMatch);
}

function getNextMatchTargetSide(matchId) {
  return {
    "qf-1": "team2",
    "qf-2": "team2",
    "sf-1": "team1",
    "sf-2": "team2",
  }[matchId] || null;
}

function getThirdPlaceMatchTargetSide(matchId) {
  return {
    "sf-1": "team1",
    "sf-2": "team2",
  }[matchId] || null;
}

function getCompletedWinner(match) {
  if (!match || match.status !== "completed" || !match.winnerTeamId) {
    return null;
  }

  return [match.team1, match.team2].find((team) => team?.id === match.winnerTeamId) || null;
}

function getCompletedLoser(match) {
  if (!match || match.status !== "completed" || !match.winnerTeamId) {
    return null;
  }

  return [match.team1, match.team2].find((team) => team && team.id !== match.winnerTeamId) || null;
}
