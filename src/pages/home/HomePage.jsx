import React from "react";
import { getRouteHref, ROUTES } from "../../app/router.js";

export default function HomePage() {
  return (
    <div className="page-shell hub-shell">
      <header className="hero-card hub-hero">
        <div className="hero-copy">
          <p className="eyebrow">30s Leaderboard</p>
          <h1>써티즈 리그 허브</h1>
          <p className="hero-description">필요한 화면으로 바로 이동합니다.</p>
        </div>
      </header>

      <main className="hub-grid" aria-label="페이지 이동">
        <a className="hub-button primary-button button-link" href={getRouteHref(ROUTES.league)} data-router-link>
          리그 순위표
        </a>
        <a
          className="hub-button secondary-button button-link"
          href={getRouteHref(ROUTES.leagueTournament)}
          data-router-link
        >
          리그토너먼트
        </a>
        <a className="hub-button secondary-button button-link" href={getRouteHref(ROUTES.admin)} data-router-link>
          관리자
        </a>
      </main>
    </div>
  );
}
