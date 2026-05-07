import React from "react";
import { getRouteHref, ROUTES } from "../../app/router.js";
import { AdminAccessGate } from "../../shared/adminSession.jsx";

export default function AdminHubPage() {
  return (
    <div className="page-shell hub-shell">
      <AdminAccessGate heading="관리자 인증">
        {({ handleLogout }) => (
          <>
            <header className="hero-card hub-hero">
              <div className="hero-copy">
                <p className="eyebrow">Admin Hub</p>
                <h1>관리자 허브</h1>
                <p className="hero-description">관리할 항목을 선택합니다.</p>
              </div>
              <div className="viewer-hero-toolbar">
                <button className="ghost-danger-button" type="button" onClick={handleLogout}>
                  로그아웃
                </button>
              </div>
            </header>

            <main className="hub-grid" aria-label="관리 페이지 이동">
              <a
                className="hub-button primary-button button-link"
                href={getRouteHref(ROUTES.adminLeague)}
                data-router-link
              >
                리그순위표 관리
              </a>
              <a
                className="hub-button secondary-button button-link"
                href={getRouteHref(ROUTES.adminLeagueTournament)}
                data-router-link
              >
                리그토너먼트 관리
              </a>
            </main>
          </>
        )}
      </AdminAccessGate>
    </div>
  );
}
