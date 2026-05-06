import { getSupabaseClient } from "../../../shared/supabaseClient.js";
import {
  createTwoGroups,
  generateSixTeamTournamentBracket,
  generateThreeTeamRoundRobinMatches,
} from "./leagueTournament.js";

const TOURNAMENT_TABLE = "league_tournaments";
const TEAM_TABLE = "league_tournament_teams";
const PRELIMINARY_MATCH_TABLE = "league_tournament_preliminary_matches";
const TOURNAMENT_MATCH_TABLE = "league_tournament_matches";

export async function createLeagueTournamentRecord(tournamentName, teams) {
  const supabase = getSupabaseClient();
  const updatedAt = new Date().toISOString();
  const { data: tournament, error: tournamentError } = await supabase
    .from(TOURNAMENT_TABLE)
    .insert({
      name: tournamentName.trim(),
      status: "preliminary",
      updated_at: updatedAt,
    })
    .select("id")
    .single();

  if (tournamentError) {
    throw createRepositoryError(tournamentError.message, tournamentError.code);
  }

  const tournamentId = tournament.id;
  const { data: teamRows, error: teamsError } = await supabase
    .from(TEAM_TABLE)
    .insert(
      teams.map((team, index) => ({
        tournament_id: tournamentId,
        slot_number: index + 1,
        group_id: index < 3 ? "A" : "B",
        group_slot: (index % 3) + 1,
        name: team.name,
        player1_name: team.player1Name,
        player2_name: team.player2Name,
      }))
    )
    .select("id, tournament_id, slot_number, group_id, group_slot, name, player1_name, player2_name")
    .order("slot_number", { ascending: true });

  if (teamsError) {
    throw createRepositoryError(teamsError.message, teamsError.code);
  }

  const normalizedTeams = normalizeTeamRows(teamRows || []);
  const groups = createTwoGroups(normalizedTeams);
  const preliminaryMatches = groups.flatMap(generateThreeTeamRoundRobinMatches);
  const { error: preliminaryError } = await supabase
    .from(PRELIMINARY_MATCH_TABLE)
    .insert(
      preliminaryMatches.map((match, index) => ({
        tournament_id: tournamentId,
        group_id: match.groupId,
        match_number: (index % 3) + 1,
        team1_id: match.team1.id,
        team2_id: match.team2.id,
      }))
    );

  if (preliminaryError) {
    throw createRepositoryError(preliminaryError.message, preliminaryError.code);
  }

  const bracket = generateSixTeamTournamentBracket([], []);
  const { error: bracketError } = await supabase
    .from(TOURNAMENT_MATCH_TABLE)
    .insert(bracket.map((match, index) => tournamentMatchToRow(tournamentId, match, index)));

  if (bracketError) {
    throw createRepositoryError(bracketError.message, bracketError.code);
  }

  return fetchLeagueTournamentRecord(tournamentId);
}

export async function fetchLatestLeagueTournamentRecord() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TOURNAMENT_TABLE)
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw createRepositoryError(error.message, error.code);
  }

  if (!data?.id) {
    return null;
  }

  return fetchLeagueTournamentRecord(data.id);
}

export async function fetchLeagueTournamentRecord(tournamentId) {
  const supabase = getSupabaseClient();
  const [tournamentResult, teamsResult, preliminaryResult, bracketResult] = await Promise.all([
    supabase
      .from(TOURNAMENT_TABLE)
      .select("id, name, status, created_at, updated_at")
      .eq("id", tournamentId)
      .single(),
    supabase
      .from(TEAM_TABLE)
      .select("id, tournament_id, slot_number, group_id, group_slot, name, player1_name, player2_name")
      .eq("tournament_id", tournamentId)
      .order("slot_number", { ascending: true }),
    supabase
      .from(PRELIMINARY_MATCH_TABLE)
      .select("id, tournament_id, group_id, match_number, team1_id, team2_id, team1_score, team2_score, winner_team_id, status")
      .eq("tournament_id", tournamentId)
      .order("group_id", { ascending: true })
      .order("match_number", { ascending: true }),
    supabase
      .from(TOURNAMENT_MATCH_TABLE)
      .select("id, tournament_id, match_key, round, name, team1_slot, team2_slot, team1_id, team2_id, team1_score, team2_score, winner_team_id, status, next_match_key, display_order")
      .eq("tournament_id", tournamentId)
      .order("display_order", { ascending: true }),
  ]);

  [tournamentResult, teamsResult, preliminaryResult, bracketResult].forEach((result) => {
    if (result.error) {
      throw createRepositoryError(result.error.message, result.error.code);
    }
  });

  const teams = normalizeTeamRows(teamsResult.data || []);
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const groups = [
    {
      id: "A",
      name: "A조",
      teams: teams.filter((team) => team.groupId === "A").sort(compareGroupTeams),
    },
    {
      id: "B",
      name: "B조",
      teams: teams.filter((team) => team.groupId === "B").sort(compareGroupTeams),
    },
  ];

  return {
    tournament: {
      id: tournamentResult.data.id,
      name: tournamentResult.data.name,
      status: tournamentResult.data.status,
      createdAt: tournamentResult.data.created_at,
      updatedAt: tournamentResult.data.updated_at,
    },
    teams,
    groups,
    preliminaryMatches: normalizePreliminaryMatchRows(preliminaryResult.data || [], teamMap),
    tournamentMatches: normalizeTournamentMatchRows(bracketResult.data || [], teamMap),
  };
}

export async function savePreliminaryMatchRecord(match) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(PRELIMINARY_MATCH_TABLE)
    .update({
      team1_score: match.team1Score,
      team2_score: match.team2Score,
      winner_team_id: match.winnerTeamId,
      status: match.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", match.dbId || match.id);

  if (error) {
    throw createRepositoryError(error.message, error.code);
  }
}

export async function saveTournamentMatchRecords(tournamentId, matches) {
  const supabase = getSupabaseClient();
  const updatedAt = new Date().toISOString();

  await Promise.all(
    matches.map(async (match, index) => {
      const { error } = await supabase
        .from(TOURNAMENT_MATCH_TABLE)
        .update({
          ...tournamentMatchToRow(tournamentId, match, index),
          updated_at: updatedAt,
        })
        .eq("tournament_id", tournamentId)
        .eq("match_key", match.id);

      if (error) {
        throw createRepositoryError(error.message, error.code);
      }
    })
  );
}

export async function updateLeagueTournamentRecordStatus(tournamentId, status) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(TOURNAMENT_TABLE)
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tournamentId);

  if (error) {
    throw createRepositoryError(error.message, error.code);
  }
}

function normalizeTeamRows(rows) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    player1Name: row.player1_name,
    player2Name: row.player2_name,
    slotNumber: row.slot_number,
    groupId: row.group_id,
    groupSlot: row.group_slot,
  }));
}

function normalizePreliminaryMatchRows(rows, teamMap) {
  return rows
    .map((row) => {
      const team1 = teamMap.get(row.team1_id);
      const team2 = teamMap.get(row.team2_id);

      if (!team1 || !team2) {
        return null;
      }

      return {
        id: row.id,
        dbId: row.id,
        groupId: row.group_id,
        team1,
        team2,
        team1Score: normalizeDbScore(row.team1_score),
        team2Score: normalizeDbScore(row.team2_score),
        winnerTeamId: row.winner_team_id || null,
        status: row.status === "completed" ? "completed" : "pending",
      };
    })
    .filter(Boolean);
}

function normalizeTournamentMatchRows(rows, teamMap) {
  return rows.map((row) => ({
    id: row.match_key,
    dbId: row.id,
    round: row.round,
    name: row.name,
    team1Slot: row.team1_slot,
    team2Slot: row.team2_slot,
    team1: row.team1_id ? teamMap.get(row.team1_id) || null : null,
    team2: row.team2_id ? teamMap.get(row.team2_id) || null : null,
    team1Score: normalizeDbScore(row.team1_score),
    team2Score: normalizeDbScore(row.team2_score),
    winnerTeamId: row.winner_team_id || null,
    status: row.status === "completed" ? "completed" : "pending",
    nextMatchId: row.next_match_key || null,
  }));
}

function tournamentMatchToRow(tournamentId, match, index) {
  return {
    tournament_id: tournamentId,
    match_key: match.id,
    round: match.round,
    name: match.name,
    team1_slot: match.team1Slot,
    team2_slot: match.team2Slot,
    team1_id: match.team1?.id || null,
    team2_id: match.team2?.id || null,
    team1_score: match.team1Score,
    team2_score: match.team2Score,
    winner_team_id: match.winnerTeamId,
    status: match.status,
    next_match_key: match.nextMatchId,
    display_order: index + 1,
  };
}

function normalizeDbScore(score) {
  return Number.isInteger(score) ? score : null;
}

function compareGroupTeams(left, right) {
  return left.groupSlot - right.groupSlot;
}

function createRepositoryError(message, code = "") {
  const error = new Error(message);
  error.code = code;
  return error;
}
