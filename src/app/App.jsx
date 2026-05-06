import React, { useEffect, useState } from "react";
import AdminPage from "../pages/admin/AdminPage.jsx";
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
  [ROUTES.admin]: "Tennis League Board Admin",
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

  if (routePath === ROUTES.admin) {
    return <AdminPage />;
  }

  if (routePath === ROUTES.leagueTournament) {
    return <LeagueTournamentPage />;
  }

  return <ViewerPage />;
}

function getRouteBasePrefix() {
  const routeHref = getRouteHref("/");

  return routeHref === "/" ? "" : routeHref.replace(/\/$/, "");
}
