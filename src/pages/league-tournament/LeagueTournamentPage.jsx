import React, { useEffect, useMemo, useRef, useState } from "react";
import { getRouteHref, ROUTES } from "../../app/router.js";
import { Message } from "../../shared/components.jsx";
import {
  getMissingConfigKeys,
  isSupabaseConfigured,
  subscribeToLeagueTournamentRealtime,
} from "../../shared/supabaseClient.js";
import {
  FinalRankingsPanel,
  GroupStandingsTable,
  PreliminaryGroups,
  PreliminaryMatchList,
  SixTeamTournamentBracket,
  WorkflowProgress,
} from "../../features/league-tournament/components/LeagueTournamentComponents.jsx";
import {
  areFinalRankingsComplete,
  areStandingsFinal,
  calculateFinalRankings,
  calculateGroupStandings,
  findChampion,
} from "../../features/league-tournament/lib/leagueTournament.js";
import { fetchLatestLeagueTournamentRecord } from "../../features/league-tournament/lib/leagueTournamentRepository.js";

const REALTIME_REFRESH_DEBOUNCE_MS = 500;
const FLOW_STEP_TRANSITION_DELAY_MS = 2800;
const FLOW_STEP_ORDER = {
  setup: 0,
  preliminary: 1,
  tournament: 2,
  complete: 3,
};

export default function LeagueTournamentPage() {
  const [record, setRecord] = useState(null);
  const [message, setMessage] = useState({ text: "", tone: "warning" });
  const [isHydrating, setIsHydrating] = useState(false);
  const isHydratingRef = useRef(false);
  const hasPendingRefreshRef = useRef(false);
  const refreshDebounceIdRef = useRef(null);
  const hasHydratedOnceRef = useRef(false);
  const shouldDelayNextFlowStepRef = useRef(false);
  const flowStepTransitionTimeoutRef = useRef(null);
  const pendingTransitionScrollRef = useRef(false);
  const transitionedSectionAnchorRef = useRef(null);

  const groups = record?.groups || [];
  const preliminaryMatches = record?.preliminaryMatches || [];
  const tournamentMatches = record?.tournamentMatches || [];
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

  async function hydrateLeagueTournamentPage({ showLoadingMessage = false } = {}) {
    if (isHydratingRef.current) {
      hasPendingRefreshRef.current = true;
      return;
    }

    isHydratingRef.current = true;
    setIsHydrating(true);

    if (showLoadingMessage) {
      setMessage({ text: "저장된 리그토너먼트 대회를 불러오는 중입니다.", tone: "warning" });
    }

    try {
      const latestRecord = await fetchLatestLeagueTournamentRecord();
      const nextFlowStep = getRecordFlowStep(latestRecord);
      const currentFlowStep = getRecordFlowStep(record);

      if (
        hasHydratedOnceRef.current &&
        nextFlowStep &&
        currentFlowStep &&
        (FLOW_STEP_ORDER[nextFlowStep] ?? 0) > (FLOW_STEP_ORDER[currentFlowStep] ?? 0)
      ) {
        shouldDelayNextFlowStepRef.current = true;
      }

      setRecord(latestRecord);
      hasHydratedOnceRef.current = true;
      setMessage(
        latestRecord
          ? { text: "", tone: "warning" }
          : { text: "아직 공개할 리그토너먼트 운영표가 없습니다.", tone: "warning" }
      );
    } catch (error) {
      setMessage({
        text: error.message || "리그토너먼트 데이터를 불러오지 못했습니다.",
        tone: "danger",
      });
    } finally {
      setIsHydrating(false);
      isHydratingRef.current = false;

      if (hasPendingRefreshRef.current) {
        hasPendingRefreshRef.current = false;
        void hydrateLeagueTournamentPage();
      }
    }
  }

  function scheduleRealtimeRefresh() {
    if (refreshDebounceIdRef.current) {
      window.clearTimeout(refreshDebounceIdRef.current);
    }

    refreshDebounceIdRef.current = window.setTimeout(() => {
      refreshDebounceIdRef.current = null;
      void hydrateLeagueTournamentPage();
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const missingKeys = getMissingConfigKeys().join(", ");
      setMessage({
        text: `Supabase 설정이 비어 있습니다. config.js의 ${missingKeys} 값을 채운 뒤 다시 새로고침해 주세요.`,
        tone: "warning",
      });
      return undefined;
    }

    void hydrateLeagueTournamentPage({ showLoadingMessage: true });
    const cleanupRealtime = subscribeToLeagueTournamentRealtime(scheduleRealtimeRefresh);

    return () => {
      if (refreshDebounceIdRef.current) {
        window.clearTimeout(refreshDebounceIdRef.current);
        refreshDebounceIdRef.current = null;
      }

      cleanupRealtime();
    };
  }, []);

  const emptySection = !record && !isHydrating ? (
    <section className="panel wide-panel" aria-labelledby="empty-tournament-heading">
      <div className="section-header">
        <div>
          <p className="section-kicker">Status</p>
          <h2 id="empty-tournament-heading">진행 중인 대회 없음</h2>
        </div>
      </div>
      <p className="section-description">관리자 페이지에서 운영표가 생성되면 이 화면에 표시됩니다.</p>
    </section>
  ) : null;

  const groupSection = (
    <PreliminaryGroups
      defaultOpen={displayFlowStep === "preliminary"}
      groups={groups}
      resetKey={`${record?.tournament.name || "empty"}-${displayFlowStep}`}
      statusLabel={groups.length > 0 ? "완료" : ""}
      statusTone="success"
    />
  );

  const preliminarySection = (
    <PreliminaryMatchList
      defaultOpen={hasGeneratedTournament && displayFlowStep === "preliminary"}
      groups={groups}
      matches={preliminaryMatches}
      message={{ text: "", tone: "warning" }}
      readOnly
      resetKey={`${record?.tournament.name || "empty"}-${displayFlowStep}`}
      statusLabel={standingsReady ? "완료" : "진행 중"}
      statusTone={standingsReady ? "success" : "active"}
    />
  );

  const standingsSections = [
    groups.length > 0 && groupA ? (
      <GroupStandingsTable
        key="standings-a"
        defaultOpen={displayFlowStep === "preliminary" || displayFlowStep === "tournament"}
        group={groupA}
        resetKey={`${record?.tournament.name || "empty"}-${displayFlowStep}`}
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
        resetKey={`${record?.tournament.name || "empty"}-${displayFlowStep}`}
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
      message={{ text: "", tone: "warning" }}
      readOnly
      resetKey={`${record?.tournament.name || "empty"}-${displayFlowStep}`}
      standingsReady={standingsReady}
      statusLabel={!standingsReady ? "대기" : finalRankingsComplete ? "완료" : "진행 중"}
      statusTone={!standingsReady ? "neutral" : finalRankingsComplete ? "success" : "active"}
    />
  );

  const finalRankingsSection = (
    <FinalRankingsPanel rankings={tournamentMatches.length > 0 ? finalRankings : []} />
  );

  const orderedSections = orderTournamentSections(displayFlowStep, {
    bracketSection,
    emptySection,
    finalRankingsSection,
    groupSection,
    preliminarySection,
    standingsSections,
    standingsWarningSection,
  });

  return (
    <div className="page-shell">
      <header className="hero-card viewer-hero-card">
        <div className="hero-copy">
          <p className="eyebrow">League & Tournament</p>
          <h1>리그토너먼트</h1>
          <p className="hero-description">
            예선 조편성, 예선 결과, 본선 대진표, 최종 순위를 확인합니다.
          </p>
        </div>
        <div className="viewer-hero-toolbar">
          <a className="secondary-button button-link" href={getRouteHref(ROUTES.home)} data-router-link>
            홈
          </a>
          <a className="secondary-button button-link" href={getRouteHref(ROUTES.league)} data-router-link>
            순위표
          </a>
          <a className="secondary-button button-link" href={getRouteHref(ROUTES.adminLeagueTournament)} data-router-link>
            관리자
          </a>
        </div>
      </header>

      <main className="main-grid">
        {message.text ? (
          <section className="panel status-panel" aria-live="polite">
            <Message className="status-banner" message={message} />
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
              결과가 업데이트되었습니다. 현재 화면에서 잠시 확인한 뒤 {formatFlowStepLabel(flowStep)} 화면으로 이동합니다.
            </p>
          </section>
        ) : null}

        <div className="section-scroll-anchor" ref={transitionedSectionAnchorRef} />
        {orderedSections}
      </main>
    </div>
  );
}

function getRecordFlowStep(record) {
  if (!record) {
    return "setup";
  }

  const groups = record.groups || [];
  const preliminaryMatches = record.preliminaryMatches || [];
  const tournamentMatches = record.tournamentMatches || [];
  const groupA = groups.find((group) => group.id === "A") || null;
  const groupB = groups.find((group) => group.id === "B") || null;
  const groupAStandings = groupA ? calculateGroupStandings(groupA, preliminaryMatches) : [];
  const groupBStandings = groupB ? calculateGroupStandings(groupB, preliminaryMatches) : [];
  const standingsReady = areStandingsFinal(groupAStandings) && areStandingsFinal(groupBStandings);

  if (areFinalRankingsComplete(tournamentMatches)) {
    return "complete";
  }

  if (standingsReady) {
    return "tournament";
  }

  return groups.length > 0 ? "preliminary" : "setup";
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
    setup: sections.emptySection,
    preliminary: sections.standingsSections[0],
    tournament: sections.bracketSection,
    complete: sections.finalRankingsSection,
  };
  const primarySection = sectionMap[flowStep] || sections.emptySection;

  return [
    primarySection,
    ...(flowStep === "preliminary" ? sections.standingsSections.slice(1) : []),
    flowStep === "preliminary" ? sections.preliminarySection : sections.groupSection,
    ...(flowStep === "preliminary" ? [] : sections.standingsSections),
    sections.preliminarySection,
    sections.standingsWarningSection,
    sections.bracketSection,
    sections.finalRankingsSection,
    sections.emptySection,
  ]
    .filter((section, index, allSections) => section && allSections.indexOf(section) === index)
    .map((section, index) =>
      React.isValidElement(section)
        ? React.cloneElement(section, { key: section.key || `${flowStep}-${index}` })
        : section
    );
}
