import React, { useEffect, useMemo, useState } from "react";
import { getRouteHref } from "../../app/router.js";
import { Message } from "../../shared/components.jsx";
import {
  getMissingConfigKeys,
  isSupabaseConfigured,
} from "../../shared/supabaseClient.js";
import {
  ChampionCard,
  GroupStandingsTable,
  LeagueTournamentForm,
  PreliminaryGroups,
  PreliminaryMatchList,
  SixTeamTournamentBracket,
  WorkflowProgress,
} from "../../features/league-tournament/components/LeagueTournamentComponents.jsx";
import {
  areStandingsFinal,
  calculateGroupStandings,
  findChampion,
  generateSixTeamTournamentBracket,
  normalizeLeagueTournamentScore,
  updateTournamentWinner,
  validateLeagueTournamentInput,
} from "../../features/league-tournament/lib/leagueTournament.js";
import {
  createLeagueTournamentRecord,
  fetchLatestLeagueTournamentRecord,
  savePreliminaryMatchRecord,
  saveTournamentMatchRecords,
  updateLeagueTournamentRecordStatus,
} from "../../features/league-tournament/lib/leagueTournamentRepository.js";

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
  const [currentTournamentId, setCurrentTournamentId] = useState("");
  const [dbMessage, setDbMessage] = useState({ text: "", tone: "warning" });
  const [isHydrating, setIsHydrating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
  const hasGeneratedTournament = groups.length > 0;
  const preliminaryCompletedCount = preliminaryMatches.filter(
    (match) => match.status === "completed"
  ).length;
  const tournamentCompletedCount = tournamentMatches.filter(
    (match) => match.status === "completed"
  ).length;
  const hasTiebreakReview = [...groupAStandings, ...groupBStandings].some(
    (row) => row.needsTiebreakReview
  );
  const flowStep = champion
    ? "complete"
    : standingsReady
      ? "tournament"
      : hasGeneratedTournament
        ? "preliminary"
        : "setup";
  const configMissing = !isSupabaseConfigured();

  function applyTournamentRecord(record) {
    if (!record) {
      setCurrentTournamentId("");
      setGeneratedTournamentName("");
      setGroups([]);
      setPreliminaryMatches([]);
      setTournamentMatches([]);
      return;
    }

    setCurrentTournamentId(record.tournament.id);
    setTournamentName(record.tournament.name);
    setTeamInputs(record.teams);
    setGeneratedTournamentName(record.tournament.name);
    setGroups(record.groups);
    setPreliminaryMatches(record.preliminaryMatches);
    setTournamentMatches(record.tournamentMatches);
    setValidation({ errors: [], warnings: [], isValid: true });
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const missingKeys = getMissingConfigKeys().join(", ");
      setDbMessage({
        text: `Supabase 설정이 비어 있습니다. config.js의 ${missingKeys} 값을 채운 뒤 운영표를 생성할 수 있습니다.`,
        tone: "warning",
      });
      return;
    }

    let isActive = true;
    setIsHydrating(true);
    setDbMessage({ text: "저장된 리그 & 토너먼트 대회를 불러오는 중입니다.", tone: "warning" });

    fetchLatestLeagueTournamentRecord()
      .then((record) => {
        if (!isActive) {
          return;
        }

        applyTournamentRecord(record);
        setDbMessage(
          record
            ? { text: "DB에 저장된 최신 운영표를 불러왔습니다.", tone: "success" }
            : { text: "저장된 운영표가 없습니다. 대회 정보를 입력해 운영표를 생성하세요.", tone: "warning" }
        );
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setDbMessage({
          text: error.message || "리그 & 토너먼트 데이터를 불러오지 못했습니다.",
          tone: "danger",
        });
      })
      .finally(() => {
        if (isActive) {
          setIsHydrating(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  function handleTeamChange(teamId, field, value) {
    setTeamInputs((currentTeams) =>
      currentTeams.map((team) => (team.id === teamId ? { ...team, [field]: value } : team))
    );
  }

  async function handleGenerate(event) {
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

    if (configMissing) {
      setDbMessage({
        text: "Supabase 설정이 없어 운영표를 DB에 저장할 수 없습니다.",
        tone: "danger",
      });
      return;
    }

    setIsSaving(true);
    setDbMessage({ text: "운영표를 DB에 저장하는 중입니다.", tone: "warning" });

    try {
      const record = await createLeagueTournamentRecord(tournamentName, trimmedTeams);
      applyTournamentRecord(record);
      setPreliminaryMessage({
        text: "운영표를 생성했습니다. 예선 점수를 입력하면 순위와 본선 대진표가 자동 갱신됩니다.",
        tone: "success",
      });
      setTournamentMessage({ text: "", tone: "warning" });
      setDbMessage({ text: "운영표가 DB에 저장되었습니다.", tone: "success" });
    } catch (error) {
      setDbMessage({
        text: error.message || "운영표를 DB에 저장하지 못했습니다.",
        tone: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePreliminaryScoreChange(matchId, field, value) {
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
    const nextTournamentMatches = groupA && groupB
      ? generateSixTeamTournamentBracket(nextGroupAStandings, nextGroupBStandings)
      : tournamentMatches;
    const changedMatch = nextMatches.find((match) => match.id === matchId);

    setPreliminaryMatches(nextMatches);

    if (groupA && groupB) {
      setTournamentMatches(nextTournamentMatches);
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

    if (!currentTournamentId || !changedMatch || configMissing) {
      return;
    }

    try {
      await savePreliminaryMatchRecord(changedMatch);

      if (groupA && groupB) {
        await saveTournamentMatchRecords(currentTournamentId, nextTournamentMatches);
        await updateLeagueTournamentRecordStatus(
          currentTournamentId,
          didCompleteAllStandings ? "tournament" : "preliminary"
        );
      }

      setDbMessage({ text: "경기 결과가 DB에 저장되었습니다.", tone: "success" });
    } catch (error) {
      setDbMessage({
        text: error.message || "예선 경기 결과를 DB에 저장하지 못했습니다.",
        tone: "danger",
      });
    }
  }

  async function handleTournamentScoreSave(matchId, rawTeam1Score, rawTeam2Score) {
    const team1Score = normalizeLeagueTournamentScore(rawTeam1Score);
    const team2Score = normalizeLeagueTournamentScore(rawTeam2Score);

    if (team1Score === null || team2Score === null) {
      setTournamentMessage({ text: "점수는 0 이상의 정수만 입력할 수 있습니다.", tone: "danger" });
      return;
    }

    try {
      const nextMatches = updateTournamentWinner(tournamentMatches, matchId, team1Score, team2Score);
      const nextChampion = findChampion(nextMatches);
      setTournamentMatches(nextMatches);
      setTournamentMessage({ text: "토너먼트 결과를 반영했습니다.", tone: "success" });

      if (currentTournamentId && !configMissing) {
        await saveTournamentMatchRecords(currentTournamentId, nextMatches);
        await updateLeagueTournamentRecordStatus(
          currentTournamentId,
          nextChampion ? "completed" : "tournament"
        );
        setDbMessage({ text: "본선 결과가 DB에 저장되었습니다.", tone: "success" });
      }
    } catch (error) {
      setTournamentMessage({
        text: error.message || "토너먼트 결과 반영 중 오류가 발생했습니다.",
        tone: "danger",
      });
      setDbMessage({
        text: error.message || "본선 결과를 DB에 저장하지 못했습니다.",
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
        {dbMessage.text ? (
          <section className="panel status-panel" aria-live="polite">
            <Message className="status-banner" message={dbMessage} />
          </section>
        ) : null}

        <WorkflowProgress
          champion={champion}
          flowStep={flowStep}
          hasGeneratedTournament={hasGeneratedTournament}
          hasTiebreakReview={hasTiebreakReview}
          preliminaryCompletedCount={preliminaryCompletedCount}
          preliminaryTotalCount={preliminaryMatches.length}
          standingsReady={standingsReady}
          tournamentCompletedCount={tournamentCompletedCount}
          tournamentTotalCount={tournamentMatches.length}
        />

        <LeagueTournamentForm
          defaultOpen={!hasGeneratedTournament || validation.errors.length > 0}
          disabled={isHydrating || isSaving || configMissing}
          errors={validation.errors}
          isSubmitting={isSaving}
          onGenerate={handleGenerate}
          onTeamChange={handleTeamChange}
          onTournamentNameChange={setTournamentName}
          resetKey={`${generatedTournamentName || "new"}-${flowStep}`}
          statusLabel={
            validation.errors.length > 0 ? "확인 필요" : hasGeneratedTournament ? "완료" : "진행 중"
          }
          statusTone={
            validation.errors.length > 0 ? "danger" : hasGeneratedTournament ? "success" : "active"
          }
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

        <PreliminaryGroups
          defaultOpen={false}
          groups={groups}
          resetKey={`${generatedTournamentName}-${flowStep}`}
          statusLabel="완료"
          statusTone="success"
        />
        <PreliminaryMatchList
          defaultOpen={hasGeneratedTournament && !standingsReady}
          groups={groups}
          matches={preliminaryMatches}
          message={preliminaryMessage}
          resetKey={`${generatedTournamentName}-${flowStep}`}
          statusLabel={standingsReady ? "완료" : "진행 중"}
          statusTone={standingsReady ? "success" : "active"}
          onScoreChange={handlePreliminaryScoreChange}
        />

        {groups.length > 0 && groupA ? (
          <GroupStandingsTable
            defaultOpen={!champion}
            group={groupA}
            resetKey={`${generatedTournamentName}-${flowStep}`}
            standings={groupAStandings}
            statusLabel={
              groupAStandings.some((row) => row.needsTiebreakReview)
                ? "확인 필요"
                : standingsReady
                  ? "확정"
                  : "계산 중"
            }
            statusTone={
              groupAStandings.some((row) => row.needsTiebreakReview)
                ? "danger"
                : standingsReady
                  ? "success"
                  : "active"
            }
          />
        ) : null}
        {groups.length > 0 && groupB ? (
          <GroupStandingsTable
            defaultOpen={!champion}
            group={groupB}
            resetKey={`${generatedTournamentName}-${flowStep}`}
            standings={groupBStandings}
            statusLabel={
              groupBStandings.some((row) => row.needsTiebreakReview)
                ? "확인 필요"
                : standingsReady
                  ? "확정"
                  : "계산 중"
            }
            statusTone={
              groupBStandings.some((row) => row.needsTiebreakReview)
                ? "danger"
                : standingsReady
                  ? "success"
                  : "active"
            }
          />
        ) : null}

        {groups.length > 0 && !standingsReady ? (
          <section className="panel status-panel">
            <p className="status-banner" data-tone="warning">
              예선 순위가 확정되지 않았거나 동률 확인 필요 상태가 있으면 본선 대진은 placeholder로 표시됩니다.
            </p>
          </section>
        ) : null}

        <SixTeamTournamentBracket
          defaultOpen={standingsReady && !champion}
          matches={tournamentMatches}
          message={tournamentMessage}
          resetKey={`${generatedTournamentName}-${flowStep}`}
          standingsReady={standingsReady}
          statusLabel={!standingsReady ? "대기" : champion ? "완료" : "진행 중"}
          statusTone={!standingsReady ? "neutral" : champion ? "success" : "active"}
          onSaveScore={handleTournamentScoreSave}
        />
        <ChampionCard champion={champion} />
      </main>
    </div>
  );
}
