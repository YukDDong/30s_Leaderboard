import React, { useEffect, useState } from "react";
import AdminHubPage from "../pages/admin/AdminHubPage.jsx";
import AdminPage from "../pages/admin/AdminPage.jsx";
import HomePage from "../pages/home/HomePage.jsx";
import LeagueTournamentAdminPage from "../pages/league-tournament/LeagueTournamentAdminPage.jsx";
import LeagueTournamentPage from "../pages/league-tournament/LeagueTournamentPage.jsx";
import ViewerPage from "../pages/viewer/ViewerPage.jsx";
import {
  getCurrentRoutePath,
  getRouteHref,
  isLegacyPath,
  normalizeRoutePath,
  ROUTES,
} from "./router.js";

const routeTitles = {
  [ROUTES.home]: "Tennis League Board",
  [ROUTES.league]: "Tennis League Standings",
  [ROUTES.admin]: "Tennis League Board Admin",
  [ROUTES.adminLeague]: "Tennis League Standings Admin",
  [ROUTES.adminLeagueTournament]: "League & Tournament Admin",
  [ROUTES.leagueTournament]: "League & Tournament",
};

export default function App() {
  const [routePath, setRoutePath] = useState(getCurrentRoutePath);

  useEffect(() => {
    if (isLegacyPath()) {
      window.history.replaceState({}, "", getRouteHref(routePath));
    }
  }, [routePath]);

  useEffect(() => {
    function syncRouteFromLocation() {
      setRoutePath(getCurrentRoutePath());
    }

    function handleDocumentClick(event) {
      const anchor = event.target.closest?.("a[data-router-link]");

      if (
        !anchor ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      const targetUrl = new URL(anchor.href);

      if (targetUrl.origin !== window.location.origin) {
        return;
      }

      event.preventDefault();
      const nextRoutePath = normalizeRoutePath(targetUrl.pathname.replace(getRouteBasePrefix(), "") || "/");
      window.history.pushState({}, "", getRouteHref(nextRoutePath));
      setRoutePath(nextRoutePath);
      window.scrollTo({ top: 0 });
    }

    window.addEventListener("popstate", syncRouteFromLocation);
    document.addEventListener("click", handleDocumentClick);

    return () => {
      window.removeEventListener("popstate", syncRouteFromLocation);
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  useEffect(() => {
    document.title = routeTitles[routePath] || routeTitles[ROUTES.home];
  }, [routePath]);

  if (routePath === ROUTES.home) {
    return <HomePage />;
  }

  if (routePath === ROUTES.league) {
    return <ViewerPage />;
  }

  if (routePath === ROUTES.admin) {
    return <AdminHubPage />;
  }

  if (routePath === ROUTES.adminLeague) {
    return <AdminPage />;
  }

  if (routePath === ROUTES.leagueTournament) {
    return <LeagueTournamentPage />;
  }

  if (routePath === ROUTES.adminLeagueTournament) {
    return <LeagueTournamentAdminPage />;
  }

  return <HomePage />;
}

function getRouteBasePrefix() {
  const routeHref = getRouteHref("/");

  return routeHref === "/" ? "" : routeHref.replace(/\/$/, "");
}
