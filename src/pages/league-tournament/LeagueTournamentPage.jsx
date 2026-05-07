import React, { useEffect, useMemo, useState } from "react";
import { getRouteHref, ROUTES } from "../../app/router.js";
import { Message } from "../../shared/components.jsx";
import {
  getMissingConfigKeys,
  isSupabaseConfigured,
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

export default function LeagueTournamentPage() {
  const [record, setRecord] = useState(null);
  const [message, setMessage] = useState({ text: "", tone: "warning" });
  const [isHydrating, setIsHydrating] = useState(false);

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

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const missingKeys = getMissingConfigKeys().join(", ");
      setMessage({
        text: `Supabase 설정이 비어 있습니다. config.js의 ${missingKeys} 값을 채운 뒤 다시 새로고침해 주세요.`,
        tone: "warning",
      });
      return;
    }

    let isActive = true;
    setIsHydrating(true);
    setMessage({ text: "저장된 리그토너먼트 대회를 불러오는 중입니다.", tone: "warning" });

    fetchLatestLeagueTournamentRecord()
      .then((latestRecord) => {
        if (!isActive) {
          return;
        }

        setRecord(latestRecord);
        setMessage(
          latestRecord
            ? { text: "", tone: "warning" }
            : { text: "아직 공개할 리그토너먼트 운영표가 없습니다.", tone: "warning" }
        );
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setMessage({
          text: error.message || "리그토너먼트 데이터를 불러오지 못했습니다.",
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
      defaultOpen={flowStep === "preliminary"}
      groups={groups}
      resetKey={`${record?.tournament.name || "empty"}-${flowStep}`}
      statusLabel={groups.length > 0 ? "완료" : ""}
      statusTone="success"
    />
  );

  const preliminarySection = (
    <PreliminaryMatchList
      defaultOpen={hasGeneratedTournament && flowStep === "preliminary"}
      groups={groups}
      matches={preliminaryMatches}
      message={{ text: "", tone: "warning" }}
      readOnly
      resetKey={`${record?.tournament.name || "empty"}-${flowStep}`}
      statusLabel={standingsReady ? "완료" : "진행 중"}
      statusTone={standingsReady ? "success" : "active"}
    />
  );

  const standingsSections = [
    groups.length > 0 && groupA ? (
      <GroupStandingsTable
        key="standings-a"
        defaultOpen={flowStep === "preliminary" || flowStep === "tournament"}
        group={groupA}
        resetKey={`${record?.tournament.name || "empty"}-${flowStep}`}
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
        defaultOpen={flowStep === "preliminary" || flowStep === "tournament"}
        group={groupB}
        resetKey={`${record?.tournament.name || "empty"}-${flowStep}`}
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
      defaultOpen={flowStep === "tournament"}
      matches={tournamentMatches}
      message={{ text: "", tone: "warning" }}
      readOnly
      resetKey={`${record?.tournament.name || "empty"}-${flowStep}`}
      standingsReady={standingsReady}
      statusLabel={!standingsReady ? "대기" : finalRankingsComplete ? "완료" : "진행 중"}
      statusTone={!standingsReady ? "neutral" : finalRankingsComplete ? "success" : "active"}
    />
  );

  const finalRankingsSection = (
    <FinalRankingsPanel rankings={tournamentMatches.length > 0 ? finalRankings : []} />
  );

  const orderedSections = orderTournamentSections(flowStep, {
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
          flowStep={flowStep}
          hasGeneratedTournament={hasGeneratedTournament}
          hasTiebreakReview={hasTiebreakReview}
          preliminaryCompletedCount={preliminaryCompletedCount}
          preliminaryTotalCount={preliminaryMatches.length}
          standingsReady={standingsReady}
          tournamentCompletedCount={tournamentCompletedCount}
          tournamentTotalCount={tournamentMatches.length}
        />

        {orderedSections}
      </main>
    </div>
  );
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
