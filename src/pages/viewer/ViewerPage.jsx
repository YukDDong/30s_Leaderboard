import React, { useEffect, useRef, useState } from "react";
import { ConfigNotice, MatchesMatrix, Message, StandingsTable, SummaryCards } from "../../shared/components.jsx";
import { normalizeLeagueData } from "../../shared/league.js";
import { getRouteHref, ROUTES } from "../../app/router.js";
import {
  fetchLeagueData,
  getMissingConfigKeys,
  isSupabaseConfigured,
  subscribeToLeagueRealtime,
} from "../../shared/supabaseClient.js";

const REALTIME_REFRESH_DEBOUNCE_MS = 500;
const emptyLeagueState = { teams: [], matches: [], leagueAsset: null };

export default function ViewerPage() {
  const [league, setLeague] = useState(emptyLeagueState);
  const [configNotice, setConfigNotice] = useState({ text: "", tone: "warning" });
  const [matchesMessage, setMatchesMessage] = useState({ text: "", tone: "warning" });
  const isHydratingRef = useRef(false);
  const hasPendingRefreshRef = useRef(false);
  const refreshDebounceIdRef = useRef(null);

  async function hydrateViewerPage({ showLoadingMessage = false } = {}) {
    if (isHydratingRef.current) {
      hasPendingRefreshRef.current = true;
      return;
    }

    isHydratingRef.current = true;

    if (showLoadingMessage) {
      setMatchesMessage({
        text: "Supabase에서 최신 리그 데이터를 불러오는 중입니다.",
        tone: "warning",
      });
    }

    try {
      const { teams, matches, leagueAsset } = await fetchLeagueData();
      const normalized = normalizeLeagueData(teams, matches);
      setLeague({
        teams: normalized.teams,
        matches: normalized.matches,
        leagueAsset,
      });
      setMatchesMessage({ text: "", tone: "warning" });
    } catch (error) {
      setMatchesMessage({
        text:
          error.message ||
          "리그 데이터를 불러오지 못했습니다. Supabase 설정과 네트워크 상태를 확인해 주세요.",
        tone: "danger",
      });
    } finally {
      isHydratingRef.current = false;

      if (hasPendingRefreshRef.current) {
        hasPendingRefreshRef.current = false;
        void hydrateViewerPage();
      }
    }
  }

  function scheduleRealtimeRefresh() {
    if (refreshDebounceIdRef.current) {
      window.clearTimeout(refreshDebounceIdRef.current);
    }

    refreshDebounceIdRef.current = window.setTimeout(() => {
      refreshDebounceIdRef.current = null;
      void hydrateViewerPage();
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const missingKeys = getMissingConfigKeys().join(", ");
      setConfigNotice({
        text: `Supabase 설정이 비어 있습니다. config.js의 ${missingKeys} 값을 채운 뒤 다시 새로고침해 주세요.`,
        tone: "warning",
      });
      return undefined;
    }

    void hydrateViewerPage({ showLoadingMessage: true });
    const cleanupRealtime = subscribeToLeagueRealtime(scheduleRealtimeRefresh);

    return () => {
      if (refreshDebounceIdRef.current) {
        window.clearTimeout(refreshDebounceIdRef.current);
        refreshDebounceIdRef.current = null;
      }

      cleanupRealtime();
    };
  }, []);

  const imageUrl = league.leagueAsset?.imageUrl || "";

  return (
    <div className="page-shell">
      <header className="hero-card viewer-hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Tennis League Dashboard</p>
          <h1>써티즈 리그 순위표</h1>
          <p className="hero-description">보기 전용 페이지입니다.</p>
        </div>
        <div className="viewer-hero-toolbar">
          <div className="hero-actions">
            <a className="secondary-button button-link" href={getRouteHref(ROUTES.home)} data-router-link>
              홈
            </a>
            <a className="secondary-button button-link" href={getRouteHref(ROUTES.leagueTournament)} data-router-link>
              리그 & 토너먼트
            </a>
            <a className="secondary-button button-link" href={getRouteHref(ROUTES.adminLeague)} data-router-link>
              관리자 페이지
            </a>
          </div>
        </div>
      </header>

      <ConfigNotice message={configNotice} />

      <main className="main-grid">
        <section className="panel summary-panel" aria-labelledby="summary-heading">
          <div className="section-header">
            <div>
              <h2 id="summary-heading">진행 현황</h2>
            </div>
          </div>
          <SummaryCards matches={league.matches} teams={league.teams} />
        </section>

        <section className="panel wide-panel" aria-labelledby="standings-heading">
          <div className="section-header">
            <div>
              <p className="section-kicker">Standings</p>
              <h2 id="standings-heading">순위표</h2>
            </div>
          </div>
          <StandingsTable matches={league.matches} teams={league.teams} />
        </section>

        <section className="panel wide-panel" aria-labelledby="matches-heading">
          <div className="section-header">
            <div>
              <p className="section-kicker">Matches</p>
              <h2 id="matches-heading">경기 목록</h2>
            </div>
          </div>
          <MatchesMatrix
            editable={false}
            matches={league.matches}
            pendingLabel="-"
            teams={league.teams}
          />
          <Message message={matchesMessage} />
        </section>

        <section className="panel wide-panel" aria-labelledby="match-order-image-heading">
          <div className="section-header">
            <div>
              <p className="section-kicker">Photos</p>
              <h2 id="match-order-image-heading">대진 순서 이미지</h2>
            </div>
          </div>
          <div className="league-image-frame">
            {imageUrl ? (
              <img className="league-image" src={imageUrl} alt="대진 순서 이미지" />
            ) : (
              <p className="helper-text">아직 등록된 대진 순서 이미지가 없습니다.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
