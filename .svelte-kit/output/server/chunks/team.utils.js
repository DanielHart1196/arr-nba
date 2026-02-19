import { l as ssr_context } from "./context.js";
import "clsx";
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
function getTeamLogoAbbr(team) {
  const raw = (team?.abbreviation || "").toUpperCase();
  const map = {
    SA: "SAS",
    NO: "NOP",
    GS: "GSW",
    NY: "NYK",
    PHO: "PHX",
    WSH: "WAS",
    UTAH: "UTA",
    TOR: "TOR",
    MIN: "MIN",
    MIA: "MIA",
    SAS: "SAS"
  };
  const name = (team?.shortDisplayName || team?.displayName || "").toUpperCase();
  const nameMap = {
    "UTAH": "UTA",
    "LOS ANGELES CLIPPERS": "LAC",
    "LA CLIPPERS": "LAC",
    "LOS ANGELES LAKERS": "LAL",
    "LA LAKERS": "LAL",
    "GOLDEN STATE": "GSW",
    "NEW ORLEANS": "NOP",
    "SAN ANTONIO": "SAS",
    "NEW YORK": "NYK",
    "PHOENIX": "PHX",
    "WASHINGTON": "WAS"
  };
  const ab = map[raw] || raw;
  if (!nameMap[name] && name.includes("UTAH")) return "UTA";
  return nameMap[name] || ab || "";
}
export {
  getTeamLogoAbbr as g,
  onDestroy as o
};
