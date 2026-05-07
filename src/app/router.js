const DEPLOY_BASE_PATH = "/30s_Leaderboard";
const LEGACY_PATHS = {
  "/admin.html": "/admin",
  "/index.html": "/",
  "/league-tournament/admin": "/admin/league-tournament",
  "/league-tournament.html": "/league-tournament",
};

export const ROUTES = {
  home: "/",
  league: "/league",
  admin: "/admin",
  adminLeague: "/admin/league",
  adminLeagueTournament: "/admin/league-tournament",
  leagueTournament: "/league-tournament",
};

export function getBrowserRouterBase() {
  const { pathname } = window.location;

  if (pathname === DEPLOY_BASE_PATH || pathname.startsWith(`${DEPLOY_BASE_PATH}/`)) {
    return DEPLOY_BASE_PATH;
  }

  return "";
}

export function getRouteHref(routePath) {
  const normalizedRoutePath = normalizeRoutePath(routePath);
  const basePath = getBrowserRouterBase();

  return `${basePath}${normalizedRoutePath}`;
}

export function getCurrentRoutePath() {
  const basePath = getBrowserRouterBase();
  let routePath = window.location.pathname;

  if (basePath && (routePath === basePath || routePath.startsWith(`${basePath}/`))) {
    routePath = routePath.slice(basePath.length) || "/";
  }

  return normalizeRoutePath(LEGACY_PATHS[routePath] || routePath);
}

export function normalizeRoutePath(routePath) {
  const trimmedPath = String(routePath || "/").trim();
  const pathWithoutTrailingSlash =
    trimmedPath.length > 1 ? trimmedPath.replace(/\/+$/, "") : trimmedPath;

  if (!pathWithoutTrailingSlash.startsWith("/")) {
    return `/${pathWithoutTrailingSlash}`;
  }

  return pathWithoutTrailingSlash || "/";
}

export function isLegacyPath() {
  const basePath = getBrowserRouterBase();
  const pathname = basePath ? window.location.pathname.slice(basePath.length) || "/" : window.location.pathname;

  return Boolean(LEGACY_PATHS[pathname]);
}
