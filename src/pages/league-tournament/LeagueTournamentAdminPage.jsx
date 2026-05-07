import React, { useEffect, useMemo, useRef, useState } from "react";
import { getRouteHref, ROUTES } from "../../app/router.js";
import { AdminAccessGate, loadAdminSession } from "../../shared/adminSession.jsx";
import { Message } from "../../shared/components.jsx";
import {
  getMissingConfigKeys,
  isSupabaseConfigured,
} from "../../shared/supabaseClient.js";
import {
  FinalRankingsPanel,
  GroupStandingsTable,
  LeagueTournamentForm,
  PreliminaryGroups,
  PreliminaryMatchList,
  SixTeamTournamentBracket,
  WorkflowProgress,
} from "../../features/league-tournament/components/LeagueTournamentComponents.jsx";
import {
  areStandingsFinal,
  areFinalRankingsComplete,
  calculateGroupStandings,
  calculateFinalRankings,
  findChampion,
  generateSixTeamTournamentBracket,
  normalizeLeagueTournamentScore,
  updateTournamentWinner,
  validateLeagueTournamentInput,
} from "../../features/league-tournament/lib/leagueTournament.js";
import {
  createLeagueTournamentRecord,
  fetchLatestLeagueTournamentRecord,
  resetLeagueTournamentRecords,
  savePreliminaryMatchRecord,
  saveTournamentMatchRecords,
  updateLeagueTournamentRecordStatus,
} from "../../features/league-tournament/lib/leagueTournamentRepository.js";

function createInitialTeams() {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `team-${index + 1}`,
    name: "",
    player1Name: "",
    player2Name: "",
  }));
}

const initialTeams = createInitialTeams();
const FLOW_STEP_TRANSITION_DELAY_MS = 2800;
const FLOW_STEP_ORDER = {
  setup: 0,
  preliminary: 1,
  tournament: 2,
  complete: 3,
};

export default function LeagueTournamentAdminPage() {
  return (
    <div className="page-shell">
      <AdminAccessGate heading="리그토너먼트 관리자 인증">
        {({ handleLogout }) => <LeagueTournamentAdminContent onLogout={handleLogout} />}
      </AdminAccessGate>
    </div>
  );
}

function LeagueTournamentAdminContent({ onLogout }) {
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
  const shouldDelayNextFlowStepRef = useRef(false);
  const flowStepTransitionTimeoutRef = useRef(null);
  const pendingTransitionScrollRef = useRef(false);
  const transitionedSectionAnchorRef = useRef(null);

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
  const finalRankings = calculateFinalRankings(tournamentMatches);
  const finalRankingsComplete = areFinalRankingsComplete(tournamentMatches);
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
  const flowStep = finalRankingsComplete
    ? "complete"
    : standingsReady
      ? "tournament"
      : hasGeneratedTournament
        ? "preliminary"
        : "setup";
  const [displayFlowStep, setDisplayFlowStep] = useState(flowStep);
  const configMissing = !isSupabaseConfigured();
  const isHoldingFlowStepTransition = displayFlowStep !== flowStep;

  useEffect(() => {
    if (flowStepTransitionTimeoutRef.current) {
      window.clearTimeout(flowStepTransitionTimeoutRef.current);
      flowStepTransitionTimeoutRef.current = null;
    }

    const displayOrder = FLOW_STEP_ORDER[displayFlowStep] ?? 0;
    const nextOrder = FLOW_STEP_ORDER[flowStep] ?? 0;
    const shouldDelayTransition = shouldDelayNextFlowStepRef.current && nextOrder > displayOrder;
    shouldDelayNextFlowStepRef.current = false;

    if (!shouldDelayTransition) {
      setDisplayFlowStep(flowStep);
      return undefined;
    }

    flowStepTransitionTimeoutRef.current = window.setTimeout(() => {
      pendingTransitionScrollRef.current = true;
      setDisplayFlowStep(flowStep);
      flowStepTransitionTimeoutRef.current = null;
    }, FLOW_STEP_TRANSITION_DELAY_MS);

    return () => {
      if (flowStepTransitionTimeoutRef.current) {
        window.clearTimeout(flowStepTransitionTimeoutRef.current);
        flowStepTransitionTimeoutRef.current = null;
      }
    };
  }, [displayFlowStep, flowStep]);

  useEffect(() => {
    if (!pendingTransitionScrollRef.current || displayFlowStep !== flowStep) {
      return;
    }

    pendingTransitionScrollRef.current = false;
    window.requestAnimationFrame(() => {
      transitionedSectionAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [displayFlowStep, flowStep]);

  function applyTournamentRecord(record) {
    if (!record) {
      setCurrentTournamentId("");
      setTournamentName("");
      setTeamInputs(createInitialTeams());
      setValidation({ errors: [], warnings: [], isValid: false });
      setGeneratedTournamentName("");
      setGroups([]);
      setPreliminaryMatches([]);
      setTournamentMatches([]);
      setPreliminaryMessage({ text: "", tone: "warning" });
      setTournamentMessage({ text: "", tone: "warning" });
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
        text: "운영표를 생성했습니다. 예선 점수를 입력한 뒤 반영 버튼을 누르면 순위와 본선 대진표가 갱신됩니다.",
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

  async function handlePreliminaryScoreSave(matchId, rawTeam1Score, rawTeam2Score) {
    const team1Score = normalizeLeagueTournamentScore(rawTeam1Score);
    const team2Score = normalizeLeagueTournamentScore(rawTeam2Score);

    if (
      (rawTeam1Score !== "" && team1Score === null) ||
      (rawTeam2Score !== "" && team2Score === null)
    ) {
      setPreliminaryMessage({ text: "점수는 0 이상의 정수만 입력할 수 있습니다.", tone: "danger" });
      return;
    }

    if (team1Score !== null && team2Score !== null && team1Score === team2Score) {
      setPreliminaryMessage({
        text: "예선 경기는 동점을 허용하지 않습니다.",
        tone: "danger",
      });
      return;
    }

    const nextMatches = preliminaryMatches.map((match) => {
      if (match.id !== matchId) {
        return match;
      }

      const nextMatch = {
        ...match,
        team1Score,
        team2Score,
      };

      if (nextMatch.team1Score === null || nextMatch.team2Score === null) {
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

    if (didCompleteAllStandings && flowStep === "preliminary") {
      shouldDelayNextFlowStepRef.current = true;
    }

    setPreliminaryMatches(nextMatches);

    if (groupA && groupB) {
      setTournamentMatches(nextTournamentMatches);
    }

    if (team1Score === null || team2Score === null) {
      setPreliminaryMessage({ text: "점수 입력 대기 상태입니다.", tone: "warning" });
    } else if (didCompleteAllStandings) {
      setPreliminaryMessage({
        text: "예선 순위가 확정되어 본선 대진표에 실제 팀이 반영되었습니다.",
        tone: "success",
      });
      setTournamentMessage({ text: "", tone: "warning" });
    } else {
      setPreliminaryMessage({
        text: "예선 경기 결과를 반영했습니다.",
        tone: "success",
      });
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
      const nextFinalRankingsComplete = areFinalRankingsComplete(nextMatches);

      if (nextFinalRankingsComplete && flowStep === "tournament") {
        shouldDelayNextFlowStepRef.current = true;
      }

      setTournamentMatches(nextMatches);
      setTournamentMessage({ text: "토너먼트 결과를 반영했습니다.", tone: "success" });

      if (currentTournamentId && !configMissing) {
        await saveTournamentMatchRecords(currentTournamentId, nextMatches);
        await updateLeagueTournamentRecordStatus(
          currentTournamentId,
          nextFinalRankingsComplete ? "completed" : "tournament"
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

  async function handleResetSavedTournament() {
    const shouldReset = window.confirm(
      "저장된 리그토너먼트 운영표를 모두 삭제하고 처음부터 새로 작성할까요? 이 작업은 되돌릴 수 없습니다."
    );

    if (!shouldReset) {
      setDbMessage({ text: "운영표 리셋을 취소했습니다.", tone: "warning" });
      return;
    }

    if (configMissing) {
      setDbMessage({
        text: "Supabase 설정이 없어 저장된 운영표를 리셋할 수 없습니다.",
        tone: "danger",
      });
      return;
    }

    setIsSaving(true);
    setDbMessage({ text: "저장된 운영표를 리셋하는 중입니다.", tone: "warning" });

    try {
      const session = loadAdminSession();
      const response = await resetLeagueTournamentRecords(session.token);
      applyTournamentRecord(null);
      setDbMessage({
        text: response.message || "저장된 운영표를 리셋했습니다. 새 운영표를 작성할 수 있습니다.",
        tone: "success",
      });
    } catch (error) {
      setDbMessage({
        text: error.message || "저장된 운영표를 리셋하지 못했습니다.",
        tone: error.status === 401 ? "warning" : "danger",
      });
    } finally {
      setIsSaving(false);
    }
  }

  const setupSection = (
    <LeagueTournamentForm
      defaultOpen={!hasGeneratedTournament || validation.errors.length > 0 || displayFlowStep === "setup"}
      disabled={isHydrating || isSaving || configMissing}
      errors={validation.errors}
      isSubmitting={isSaving}
      onGenerate={handleGenerate}
      onTeamChange={handleTeamChange}
      onTournamentNameChange={setTournamentName}
      resetKey={`${generatedTournamentName || "new"}-${displayFlowStep}`}
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
  );

  const groupSection = (
    <PreliminaryGroups
      defaultOpen={displayFlowStep === "setup" ? false : displayFlowStep === "preliminary"}
      groups={groups}
      resetKey={`${generatedTournamentName}-${displayFlowStep}`}
      statusLabel="완료"
      statusTone="success"
    />
  );

  const preliminarySection = (
    <PreliminaryMatchList
      defaultOpen={hasGeneratedTournament && (displayFlowStep === "preliminary" || !standingsReady)}
      groups={groups}
      matches={preliminaryMatches}
      message={preliminaryMessage}
      disabled={isHydrating || isSaving || configMissing}
      resetKey={`${generatedTournamentName}-${displayFlowStep}`}
      statusLabel={standingsReady ? "완료" : "진행 중"}
      statusTone={standingsReady ? "success" : "active"}
      onSaveScore={handlePreliminaryScoreSave}
    />
  );

  const standingsSections = [
    groups.length > 0 && groupA ? (
      <GroupStandingsTable
        key="standings-a"
        defaultOpen={displayFlowStep === "preliminary" || displayFlowStep === "tournament"}
        group={groupA}
        resetKey={`${generatedTournamentName}-${displayFlowStep}`}
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
    ) : null,
    groups.length > 0 && groupB ? (
      <GroupStandingsTable
        key="standings-b"
        defaultOpen={displayFlowStep === "preliminary" || displayFlowStep === "tournament"}
        group={groupB}
        resetKey={`${generatedTournamentName}-${displayFlowStep}`}
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
    ) : null,
  ].filter(Boolean);

  const standingsWarningSection = groups.length > 0 && !standingsReady ? (
    <section className="panel status-panel">
      <p className="status-banner" data-tone="warning">
        예선 순위가 확정되지 않았거나 동률 확인 필요 상태가 있으면 본선 대진은 placeholder로 표시됩니다.
      </p>
    </section>
  ) : null;

  const bracketSection = (
    <SixTeamTournamentBracket
      defaultOpen={displayFlowStep === "tournament"}
      matches={tournamentMatches}
      message={tournamentMessage}
      resetKey={`${generatedTournamentName}-${displayFlowStep}`}
      standingsReady={standingsReady}
      statusLabel={!standingsReady ? "대기" : finalRankingsComplete ? "완료" : "진행 중"}
      statusTone={!standingsReady ? "neutral" : finalRankingsComplete ? "success" : "active"}
      onSaveScore={handleTournamentScoreSave}
    />
  );

  const finalRankingsSection = (
    <FinalRankingsPanel rankings={tournamentMatches.length > 0 ? finalRankings : []} />
  );

  const orderedSections = orderTournamentSections(displayFlowStep, {
    bracketSection,
    finalRankingsSection,
    groupSection,
    preliminarySection,
    setupSection,
    standingsSections,
    standingsWarningSection,
  });

  return (
    <>
      <header className="hero-card viewer-hero-card">
        <div className="hero-copy">
          <p className="eyebrow">League & Tournament Admin</p>
          <h1>리그토너먼트 관리</h1>
          <p className="hero-description">
            예선은 2개 조 풀리그로 진행하고, 각 조 순위에 따라 6강 토너먼트를 생성합니다.
          </p>
        </div>
        <div className="viewer-hero-toolbar">
          <a className="secondary-button button-link" href={getRouteHref(ROUTES.admin)} data-router-link>
            관리자 홈
          </a>
          <a className="secondary-button button-link" href={getRouteHref(ROUTES.leagueTournament)} data-router-link>
            보기 페이지
          </a>
          <a className="secondary-button button-link" href={getRouteHref(ROUTES.league)} data-router-link>
            순위표
          </a>
          <button
            className="ghost-danger-button"
            disabled={isHydrating || isSaving || configMissing}
            type="button"
            onClick={handleResetSavedTournament}
          >
            운영표 리셋
          </button>
          <button className="ghost-danger-button" type="button" onClick={onLogout}>
            로그아웃
          </button>
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
          finalRankingsComplete={finalRankingsComplete}
          flowStep={displayFlowStep}
          hasGeneratedTournament={hasGeneratedTournament}
          hasTiebreakReview={hasTiebreakReview}
          preliminaryCompletedCount={preliminaryCompletedCount}
          preliminaryTotalCount={preliminaryMatches.length}
          standingsReady={standingsReady}
          tournamentCompletedCount={tournamentCompletedCount}
          tournamentTotalCount={tournamentMatches.length}
        />

        {isHoldingFlowStepTransition ? (
          <section className="panel status-panel" aria-live="polite">
            <p className="status-banner" data-tone="success">
              결과가 반영되었습니다. 현재 화면에서 잠시 확인한 뒤 {formatFlowStepLabel(flowStep)} 화면으로 이동합니다.
            </p>
          </section>
        ) : null}

        <div className="section-scroll-anchor" ref={transitionedSectionAnchorRef} />
        {orderedSections}
      </main>
    </>
  );
}

function formatFlowStepLabel(flowStep) {
  return {
    setup: "대회 정보",
    preliminary: "예선",
    tournament: "본선",
    complete: "최종 순위",
  }[flowStep] || "다음 단계";
}

function orderTournamentSections(flowStep, sections) {
  const sectionMap = {
    setup: sections.setupSection,
    preliminary: sections.standingsSections[0],
    tournament: sections.bracketSection,
    complete: sections.finalRankingsSection,
  };
  const primarySection = sectionMap[flowStep] || sections.setupSection;

  return [
    primarySection,
    ...(flowStep === "preliminary" ? sections.standingsSections.slice(1) : []),
    flowStep === "preliminary" ? sections.preliminarySection : sections.groupSection,
    ...(flowStep === "preliminary" ? [] : sections.standingsSections),
    sections.preliminarySection,
    sections.standingsWarningSection,
    sections.bracketSection,
    sections.finalRankingsSection,
    sections.setupSection,
  ]
    .filter((section, index, allSections) => section && allSections.indexOf(section) === index)
    .map((section, index) =>
      React.isValidElement(section)
        ? React.cloneElement(section, { key: section.key || `${flowStep}-${index}` })
        : section
    );
}
