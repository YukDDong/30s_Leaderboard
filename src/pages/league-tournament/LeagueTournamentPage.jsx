import React, { useMemo, useState } from "react";
import { getRouteHref } from "../../app/router.js";
import {
  ChampionCard,
  GroupStandingsTable,
  LeagueTournamentForm,
  PreliminaryGroups,
  PreliminaryMatchList,
  SixTeamTournamentBracket,
} from "../../features/league-tournament/components/LeagueTournamentComponents.jsx";
import {
  areStandingsFinal,
  calculateGroupStandings,
  createTwoGroups,
  findChampion,
  generateSixTeamTournamentBracket,
  generateThreeTeamRoundRobinMatches,
  normalizeLeagueTournamentScore,
  updateTournamentWinner,
  validateLeagueTournamentInput,
} from "../../features/league-tournament/lib/leagueTournament.js";

const initialTeams = Array.from({ length: 6 }, (_, index) => ({
  id: `team-${index + 1}`,
  name: "",
  player1Name: "",
  player2Name: "",
}));

export default function LeagueTournamentPage() {
  const [tournamentName, setTournamentName] = useState("");
  const [teamInputs, setTeamInputs] = useState(initialTeams);
  const [validation, setValidation] = useState({ errors: [], warnings: [], isValid: false });
  const [generatedTournamentName, setGeneratedTournamentName] = useState("");
  const [groups, setGroups] = useState([]);
  const [preliminaryMatches, setPreliminaryMatches] = useState([]);
  const [preliminaryMessage, setPreliminaryMessage] = useState({ text: "", tone: "warning" });
  const [tournamentMatches, setTournamentMatches] = useState([]);
  const [tournamentMessage, setTournamentMessage] = useState({ text: "", tone: "warning" });

  const groupA = groups.find((group) => group.id === "A") || null;
  const groupB = groups.find((group) => group.id === "B") || null;
  const groupAStandings = useMemo(
    () => (groupA ? calculateGroupStandings(groupA, preliminaryMatches) : []),
    [groupA, preliminaryMatches]
  );
  const groupBStandings = useMemo(
    () => (groupB ? calculateGroupStandings(groupB, preliminaryMatches) : []),
    [groupB, preliminaryMatches]
  );
  const standingsReady = areStandingsFinal(groupAStandings) && areStandingsFinal(groupBStandings);
  const champion = findChampion(tournamentMatches);

  function handleTeamChange(teamId, field, value) {
    setTeamInputs((currentTeams) =>
      currentTeams.map((team) => (team.id === teamId ? { ...team, [field]: value } : team))
    );
  }

  function handleGenerate(event) {
    event.preventDefault();

    const trimmedTeams = teamInputs.map((team) => ({
      ...team,
      name: team.name.trim(),
      player1Name: team.player1Name.trim(),
      player2Name: team.player2Name.trim(),
    }));
    const nextValidation = validateLeagueTournamentInput(tournamentName, trimmedTeams);
    setValidation(nextValidation);

    if (!nextValidation.isValid) {
      return;
    }

    const nextGroups = createTwoGroups(trimmedTeams);
    const nextPreliminaryMatches = nextGroups.flatMap(generateThreeTeamRoundRobinMatches);
    const nextTournamentMatches = generateSixTeamTournamentBracket([], []);

    setTeamInputs(trimmedTeams);
    setGeneratedTournamentName(tournamentName.trim());
    setGroups(nextGroups);
    setPreliminaryMatches(nextPreliminaryMatches);
    setPreliminaryMessage({
      text: "운영표를 생성했습니다. 예선 점수를 입력하면 순위와 본선 대진표가 자동 갱신됩니다.",
      tone: "success",
    });
    setTournamentMatches(nextTournamentMatches);
    setTournamentMessage({ text: "", tone: "warning" });
  }

  function handlePreliminaryScoreChange(matchId, field, value) {
    const parsedScore = normalizeLeagueTournamentScore(value);

    if (value !== "" && parsedScore === null) {
      setPreliminaryMessage({ text: "점수는 0 이상의 정수만 입력할 수 있습니다.", tone: "danger" });
      return;
    }

    let hasTie = false;
    const nextMatches = preliminaryMatches.map((match) => {
      if (match.id !== matchId) {
        return match;
      }

      const nextMatch = {
        ...match,
        [field]: parsedScore,
      };

      if (nextMatch.team1Score === null || nextMatch.team2Score === null) {
        return {
          ...nextMatch,
          winnerTeamId: null,
          status: "pending",
        };
      }

      if (nextMatch.team1Score === nextMatch.team2Score) {
        hasTie = true;
        return {
          ...nextMatch,
          winnerTeamId: null,
          status: "pending",
        };
      }

      return {
        ...nextMatch,
        winnerTeamId:
          nextMatch.team1Score > nextMatch.team2Score ? nextMatch.team1.id : nextMatch.team2.id,
        status: "completed",
      };
    });

    const nextGroupAStandings = groupA ? calculateGroupStandings(groupA, nextMatches) : [];
    const nextGroupBStandings = groupB ? calculateGroupStandings(groupB, nextMatches) : [];
    const didCompleteAllStandings = areStandingsFinal(nextGroupAStandings) && areStandingsFinal(nextGroupBStandings);

    setPreliminaryMatches(nextMatches);

    if (groupA && groupB) {
      setTournamentMatches(generateSixTeamTournamentBracket(nextGroupAStandings, nextGroupBStandings));
    }

    if (hasTie) {
      setPreliminaryMessage({
        text: "예선 경기는 동점을 허용하지 않습니다.",
        tone: "danger",
      });
    } else if (parsedScore === null) {
      setPreliminaryMessage({ text: "점수 입력 대기 상태입니다.", tone: "warning" });
    } else if (didCompleteAllStandings) {
      setPreliminaryMessage({
        text: "예선 순위가 확정되어 본선 대진표에 실제 팀이 반영되었습니다.",
        tone: "success",
      });
      setTournamentMessage({ text: "", tone: "warning" });
    }
  }

  function handleTournamentScoreSave(matchId, rawTeam1Score, rawTeam2Score) {
    const team1Score = normalizeLeagueTournamentScore(rawTeam1Score);
    const team2Score = normalizeLeagueTournamentScore(rawTeam2Score);

    if (team1Score === null || team2Score === null) {
      setTournamentMessage({ text: "점수는 0 이상의 정수만 입력할 수 있습니다.", tone: "danger" });
      return;
    }

    try {
      setTournamentMatches((currentMatches) =>
        updateTournamentWinner(currentMatches, matchId, team1Score, team2Score)
      );
      setTournamentMessage({ text: "토너먼트 결과를 반영했습니다.", tone: "success" });
    } catch (error) {
      setTournamentMessage({
        text: error.message || "토너먼트 결과 반영 중 오류가 발생했습니다.",
        tone: "danger",
      });
    }
  }

  return (
    <div className="page-shell">
      <header className="hero-card viewer-hero-card">
        <div className="hero-copy">
          <p className="eyebrow">League & Tournament</p>
          <h1>리그 & 토너먼트</h1>
          <p className="hero-description">
            예선은 2개 조 풀리그로 진행하고, 각 조 순위에 따라 6강 토너먼트를 생성합니다.
          </p>
        </div>
        <div className="viewer-hero-toolbar">
          <a className="secondary-button button-link" href={getRouteHref("/")} data-router-link>
            순위표
          </a>
        </div>
      </header>

      <main className="main-grid">
        <LeagueTournamentForm
          errors={validation.errors}
          onGenerate={handleGenerate}
          onTeamChange={handleTeamChange}
          onTournamentNameChange={setTournamentName}
          teams={teamInputs}
          tournamentName={tournamentName}
          warnings={validation.warnings}
        />

        {generatedTournamentName ? (
          <section className="panel summary-panel" aria-labelledby="generated-tournament-heading">
            <div className="section-header">
              <div>
                <p className="section-kicker">Current</p>
                <h2 id="generated-tournament-heading">{generatedTournamentName}</h2>
              </div>
            </div>
            <div className="summary-grid">
              <article className="summary-card">
                <span className="summary-label">복식 팀</span>
                <strong className="summary-value">6</strong>
              </article>
              <article className="summary-card">
                <span className="summary-label">예선 경기</span>
                <strong className="summary-value">6</strong>
              </article>
              <article className="summary-card">
                <span className="summary-label">본선 경기</span>
                <strong className="summary-value">5</strong>
              </article>
              <article className="summary-card">
                <span className="summary-label">상태</span>
                <strong className="summary-value league-status-value">
                  {champion ? "완료" : standingsReady ? "본선" : "예선"}
                </strong>
              </article>
            </div>
          </section>
        ) : null}

        <PreliminaryGroups groups={groups} />
        <PreliminaryMatchList
          groups={groups}
          matches={preliminaryMatches}
          message={preliminaryMessage}
          onScoreChange={handlePreliminaryScoreChange}
        />

        {groups.length > 0 && groupA ? (
          <GroupStandingsTable group={groupA} standings={groupAStandings} />
        ) : null}
        {groups.length > 0 && groupB ? (
          <GroupStandingsTable group={groupB} standings={groupBStandings} />
        ) : null}

        {groups.length > 0 && !standingsReady ? (
          <section className="panel status-panel">
            <p className="status-banner" data-tone="warning">
              예선 순위가 확정되지 않았거나 동률 확인 필요 상태가 있으면 본선 대진은 placeholder로 표시됩니다.
            </p>
          </section>
        ) : null}

        <SixTeamTournamentBracket
          matches={tournamentMatches}
          message={tournamentMessage}
          standingsReady={standingsReady}
          onSaveScore={handleTournamentScoreSave}
        />
        <ChampionCard champion={champion} />
      </main>
    </div>
  );
}
