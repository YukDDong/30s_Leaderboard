import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  areStandingsFinal,
  calculateGroupStandings,
  createTwoGroups,
  findChampion,
  generateSixTeamTournamentBracket,
  generateThreeTeamRoundRobinMatches,
  updateTournamentWinner,
  validateLeagueTournamentInput,
} from "./leagueTournament.js";

const teams = Array.from({ length: 6 }, (_, index) => ({
  id: `team-${index + 1}`,
  name: `팀 ${index + 1}`,
  player1Name: `선수 ${index + 1}-1`,
  player2Name: `선수 ${index + 1}-2`,
}));

describe("league tournament utilities", () => {
  it("validates six doubles teams and warns on duplicate player names", () => {
    const duplicateNameTeams = teams.map((team, index) =>
      index === 1 ? { ...team, player1Name: teams[0].player1Name } : team
    );
    const result = validateLeagueTournamentInput("정기전", duplicateNameTeams);

    assert.equal(result.isValid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 1);

    const duplicatedTeamNameResult = validateLeagueTournamentInput("정기전", [
      teams[0],
      { ...teams[1], name: teams[0].name },
      ...teams.slice(2),
    ]);
    assert.equal(duplicatedTeamNameResult.isValid, false);
    assert.match(duplicatedTeamNameResult.errors.join("\n"), /팀명이 중복/);
  });

  it("creates A/B groups and three round-robin matches per group", () => {
    const groups = createTwoGroups(teams);
    const matches = groups.flatMap(generateThreeTeamRoundRobinMatches);

    assert.deepEqual(groups.map((group) => group.teams.length), [3, 3]);
    assert.deepEqual(groups[0].teams.map((team) => team.id), ["team-1", "team-2", "team-3"]);
    assert.deepEqual(groups[1].teams.map((team) => team.id), ["team-4", "team-5", "team-6"]);
    assert.equal(matches.filter((match) => match.groupId === "A").length, 3);
    assert.equal(matches.filter((match) => match.groupId === "B").length, 3);
    assert.equal(matches.length, 6);
  });

  it("calculates winners and rankings by wins, point diff, points for, and head-to-head", () => {
    const [group] = createTwoGroups(teams);
    const baseMatches = generateThreeTeamRoundRobinMatches(group);

    const pointDiffStandings = calculateGroupStandings(group, [
      completeMatch(baseMatches[0], 10, 8),
      completeMatch(baseMatches[1], 10, 5),
      completeMatch(baseMatches[2], 10, 9),
    ]);
    assert.equal(pointDiffStandings[0].team.id, "team-1");
    assert.equal(pointDiffStandings[0].wins, 2);

    const pointsForStandings = calculateGroupStandings(group, [
      completeMatch(baseMatches[0], 10, 8),
      completeMatch(baseMatches[1], 8, 10),
      completeMatch(baseMatches[2], 9, 7),
    ]);
    assert.deepEqual(pointsForStandings.map((row) => row.team.id), ["team-1", "team-2", "team-3"]);
    assert.equal(pointsForStandings[0].pointsFor, 18);

    const headToHeadStandings = calculateGroupStandings(group, [
      completeMatch(baseMatches[0], 10, 8),
      completeMatch(baseMatches[1], 7, 10),
      completeMatch(baseMatches[2], 9, 8),
    ]);
    assert.deepEqual(headToHeadStandings.map((row) => `${row.rank}:${row.team.id}`), [
      "1:team-3",
      "2:team-1",
      "3:team-2",
    ]);
  });

  it("marks unresolved three-way ties for manual review", () => {
    const [group] = createTwoGroups(teams);
    const baseMatches = generateThreeTeamRoundRobinMatches(group);
    const standings = calculateGroupStandings(group, [
      completeMatch(baseMatches[0], 10, 8),
      completeMatch(baseMatches[1], 8, 10),
      completeMatch(baseMatches[2], 10, 8),
    ]);

    assert.equal(areStandingsFinal(standings), false);
    assert.equal(standings.every((row) => row.needsTiebreakReview), true);
  });

  it("generates the fixed six-team tournament bracket and propagates winners", () => {
    const groups = createTwoGroups(teams);
    const groupAMatches = generateThreeTeamRoundRobinMatches(groups[0]);
    const groupBMatches = generateThreeTeamRoundRobinMatches(groups[1]);
    const groupAStandings = calculateGroupStandings(groups[0], [
      completeMatch(groupAMatches[0], 10, 8),
      completeMatch(groupAMatches[1], 10, 7),
      completeMatch(groupAMatches[2], 10, 8),
    ]);
    const groupBStandings = calculateGroupStandings(groups[1], [
      completeMatch(groupBMatches[0], 10, 8),
      completeMatch(groupBMatches[1], 10, 7),
      completeMatch(groupBMatches[2], 10, 8),
    ]);

    let bracket = generateSixTeamTournamentBracket(groupAStandings, groupBStandings);
    assert.equal(bracket.find((match) => match.id === "qf-1").team1.id, "team-2");
    assert.equal(bracket.find((match) => match.id === "qf-1").team2.id, "team-6");
    assert.equal(bracket.find((match) => match.id === "qf-2").team1.id, "team-5");
    assert.equal(bracket.find((match) => match.id === "qf-2").team2.id, "team-3");
    assert.equal(bracket.find((match) => match.id === "sf-1").team1.id, "team-4");
    assert.equal(bracket.find((match) => match.id === "sf-2").team1.id, "team-1");

    bracket = updateTournamentWinner(bracket, "qf-1", 10, 8);
    assert.equal(bracket.find((match) => match.id === "sf-1").team2.id, "team-2");

    bracket = updateTournamentWinner(bracket, "qf-2", 7, 10);
    assert.equal(bracket.find((match) => match.id === "sf-2").team2.id, "team-3");

    bracket = updateTournamentWinner(bracket, "sf-1", 10, 8);
    assert.equal(bracket.find((match) => match.id === "final").team1.id, "team-4");

    bracket = updateTournamentWinner(bracket, "sf-2", 8, 10);
    assert.equal(bracket.find((match) => match.id === "final").team2.id, "team-3");

    bracket = updateTournamentWinner(bracket, "final", 10, 6);
    assert.equal(findChampion(bracket).id, "team-4");
  });

  it("rejects tied tournament scores", () => {
    const groups = createTwoGroups(teams);
    const placeholderBracket = generateSixTeamTournamentBracket([], []);
    const bracket = placeholderBracket.map((match) =>
      match.id === "qf-1" ? { ...match, team1: groups[0].teams[0], team2: groups[1].teams[2] } : match
    );

    assert.throws(() => updateTournamentWinner(bracket, "qf-1", 10, 10), /동점/);
  });
});

function completeMatch(match, team1Score, team2Score) {
  return {
    ...match,
    team1Score,
    team2Score,
    winnerTeamId: team1Score > team2Score ? match.team1.id : match.team2.id,
    status: "completed",
  };
}
