import { y as attr_style, z as ensure_array_like, x as attr_class, G as stringify, F as bind_props, w as slot } from "../../../../chunks/index.js";
import { o as onDestroy, g as getTeamLogoAbbr } from "../../../../chunks/team.utils.js";
import { e as escape_html } from "../../../../chunks/escaping.js";
import { n as nbaService } from "../../../../chunks/nba.service.js";
import { a as attr } from "../../../../chunks/attributes.js";
function normalizeMascot(name) {
  const s = (name || "").toLowerCase();
  if (s.includes("trail blazers")) return "Trail Blazers";
  return name;
}
function createPairKey(awayName, homeName) {
  return [normalizeMascot(awayName), normalizeMascot(homeName)].sort().join("|");
}
function formatTimeAgo(timestamp) {
  const now = Math.floor(Date.now() / 1e3);
  const diff = Math.max(0, now - (Number(timestamp) || 0));
  if (diff < 60) return "just now";
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
function createTouchGestures(options = {}) {
  let startX = 0;
  let startY = 0;
  let isScrolling = false;
  let ignoreGesture = false;
  const threshold = options.threshold || 50;
  const target = options.target || (typeof document !== "undefined" ? document : null);
  if (!target) return { destroy: () => {
  } };
  function handleTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    isScrolling = false;
    const targetEl = event.target;
    ignoreGesture = !!targetEl?.closest?.('[data-no-swipe="true"]');
    if (ignoreGesture) return;
    const isSwipeArea = !!targetEl?.closest?.(".swipe-area") || document.body.classList.contains("swipe-area") || document.documentElement.classList.contains("swipe-area");
    const isScrollContainer = !!targetEl?.closest?.('[data-scrollable="true"]') || !!targetEl?.closest?.(".scroll-container");
    if (isSwipeArea) {
      isScrolling = false;
    } else if (isScrollContainer) {
      isScrolling = true;
    }
  }
  function handleTouchMove(event) {
    if (ignoreGesture) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (!isScrolling && Math.abs(deltaX) > Math.abs(deltaY)) {
      options.onHorizontalDrag?.(deltaX);
    }
  }
  function handleTouchEnd(event) {
    if (ignoreGesture) {
      ignoreGesture = false;
      options.onGestureEnd?.(false);
      return;
    }
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    let didSwipe = false;
    if (Math.abs(deltaX) > threshold && Math.abs(deltaY) < 100) {
      if (!isScrolling) {
        if (deltaX > 0 && options.onSwipeRight) {
          options.onSwipeRight();
          didSwipe = true;
        } else if (deltaX < 0 && options.onSwipeLeft) {
          options.onSwipeLeft();
          didSwipe = true;
        }
      }
    }
    if (Math.abs(deltaY) > threshold && Math.abs(deltaX) < 40) {
      if (deltaY > 0 && options.onSwipeDown) {
        options.onSwipeDown();
      } else if (deltaY < 0 && options.onSwipeUp) {
        options.onSwipeUp();
      }
    }
    startX = 0;
    startY = 0;
    isScrolling = false;
    options.onGestureEnd?.(didSwipe);
  }
  if (typeof window !== "undefined") {
    target.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
    target.addEventListener("touchmove", handleTouchMove, { capture: true, passive: true });
    target.addEventListener("touchend", handleTouchEnd, { capture: true, passive: true });
  }
  const cleanup = () => {
    target.removeEventListener("touchstart", handleTouchStart, { capture: true });
    target.removeEventListener("touchmove", handleTouchMove, { capture: true });
    target.removeEventListener("touchend", handleTouchEnd, { capture: true });
  };
  try {
    onDestroy(cleanup);
  } catch (e) {
  }
  return { destroy: cleanup };
}
function StatsTable($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let safePlayers, displayRows, totalsByKey, formattedLongest, nameColWidth, statColWidth;
    let players = $$props["players"];
    const statCols = [
      "MIN",
      "PTS",
      "REB",
      "AST",
      "STL",
      "BLK",
      "OREB",
      "DREB",
      "FGM",
      "FGA",
      "FG%",
      "3PM",
      "3PA",
      "3P%",
      "FTM",
      "FTA",
      "FT%",
      "PF",
      "TO",
      "+/-"
    ];
    const percentKeys = ["FG%", "3P%", "FT%"];
    const baseTotalKeys = statCols.filter((k) => k !== "MIN" && k !== "+/-" && !percentKeys.includes(k));
    function formatStat(row, key) {
      if (key === "FG%") return row.stats["FG%"] + "%";
      if (key === "3P%") return row.stats["3P%"] + "%";
      if (key === "FT%") return row.stats["FT%"] + "%";
      return row.stats[key];
    }
    function formatName(n) {
      const parts = (n || "").split(" ").filter(Boolean);
      if (parts.length === 0) return n || "";
      if (parts.length === 1) return parts[0];
      const firstInitial = parts[0][0].toUpperCase() + ".";
      const rest = parts.slice(1).join(" ");
      return `${firstInitial} ${rest}`;
    }
    function pct(m, a) {
      return a > 0 ? Math.round(m / a * 100) : 0;
    }
    function sumPlayersByKey(rows, key) {
      return rows.reduce(
        (total, player) => {
          const value = Number(player?.stats?.[key] ?? 0);
          return total + (Number.isFinite(value) ? value : 0);
        },
        0
      );
    }
    function buildTotals(rows) {
      const totals = {};
      for (const key of baseTotalKeys) {
        totals[key] = sumPlayersByKey(rows, key);
      }
      totals["MIN"] = "";
      totals["+/-"] = "";
      totals["FG%"] = `${pct(Number(totals.FGM ?? 0), Number(totals.FGA ?? 0))}%`;
      totals["3P%"] = `${pct(Number(totals["3PM"] ?? 0), Number(totals["3PA"] ?? 0))}%`;
      totals["FT%"] = `${pct(Number(totals.FTM ?? 0), Number(totals.FTA ?? 0))}%`;
      return totals;
    }
    safePlayers = players ?? [];
    displayRows = safePlayers.map((row) => ({
      ...row,
      displayName: formatName(row?.name ?? ""),
      statValues: statCols.map((key) => formatStat(row, key))
    }));
    totalsByKey = buildTotals(safePlayers);
    formattedLongest = Math.max(...displayRows.map((r) => r.displayName.length), 6);
    nameColWidth = `${Math.min(formattedLongest, 13)}ch`;
    statColWidth = "2.2rem";
    $$renderer2.push(`<div class="border border-white/10 rounded text-xs scroll-container stats-table-container"><div class="grid"${attr_style(`grid-template-columns: ${stringify(nameColWidth)} 1fr`)}><div><div class="px-1 py-1 font-semibold text-left border-b-2 border-white/20">PLAYER</div> <!--[-->`);
    const each_array = ensure_array_like(displayRows);
    for (let i = 0, $$length = each_array.length; i < $$length; i++) {
      let row = each_array[i];
      $$renderer2.push(`<div${attr_class(`${stringify(i === 5 ? "border-t-2 border-white/20" : "border-t border-white/5")} px-1 py-1 text-left truncate`)}>${escape_html(row.displayName)}</div>`);
    }
    $$renderer2.push(`<!--]--> <div class="border-t-2 border-white/20 px-1 py-1 font-semibold text-left">TOTAL</div></div> <div class="overflow-x-auto" data-scrollable="true"><div class="grid border-b-2 border-white/20"${attr_style(`width:max-content; grid-template-columns: repeat(${stringify(statCols.length)}, ${stringify(statColWidth)})`)}><!--[-->`);
    const each_array_1 = ensure_array_like(statCols);
    for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
      let k = each_array_1[$$index_1];
      $$renderer2.push(`<div class="py-1 text-center font-semibold">${escape_html(k)}</div>`);
    }
    $$renderer2.push(`<!--]--></div> <!--[-->`);
    const each_array_2 = ensure_array_like(displayRows);
    for (let i = 0, $$length = each_array_2.length; i < $$length; i++) {
      let row = each_array_2[i];
      $$renderer2.push(`<div${attr_class(`grid ${stringify(i === 5 ? "border-t-2 border-white/20" : "border-t border-white/5")}`)}${attr_style(`width:max-content; grid-template-columns: repeat(${stringify(statCols.length)}, ${stringify(statColWidth)})`)}><!--[-->`);
      const each_array_3 = ensure_array_like(row.statValues);
      for (let $$index_2 = 0, $$length2 = each_array_3.length; $$index_2 < $$length2; $$index_2++) {
        let value = each_array_3[$$index_2];
        $$renderer2.push(`<div class="py-1 text-center">${escape_html(value ?? "")}</div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--> <div class="grid border-t-2 border-white/20"${attr_style(`width:max-content; grid-template-columns: repeat(${stringify(statCols.length)}, ${stringify(statColWidth)})`)}><!--[-->`);
    const each_array_4 = ensure_array_like(statCols);
    for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
      let k = each_array_4[$$index_4];
      $$renderer2.push(`<div class="py-1 text-center font-semibold">${escape_html(totalsByKey[k] ?? "")}</div>`);
    }
    $$renderer2.push(`<!--]--></div></div></div></div>`);
    bind_props($$props, { players });
  });
}
function LinescoreTable($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let maxPeriods, extraPeriods, awayAb, homeAb, abLen, lineNameColWidth, gridCols;
    let linescores = $$props["linescores"];
    function abbr(team) {
      return team?.abbreviation || team?.shortDisplayName || (team?.displayName ? team.displayName.split(" ").map((w) => w[0]).join("").toUpperCase() : "");
    }
    maxPeriods = Math.max(4, linescores?.home?.periods?.length ?? 0, linescores?.away?.periods?.length ?? 0);
    extraPeriods = Math.max(0, maxPeriods - 4);
    awayAb = abbr(linescores?.away?.team) || "";
    homeAb = abbr(linescores?.home?.team) || "";
    abLen = Math.max(awayAb.length, homeAb.length);
    lineNameColWidth = `${Math.min(Math.max(abLen, 3), 6)}ch`;
    gridCols = `${lineNameColWidth} 1fr repeat(4, 2.2rem) 2.2rem${extraPeriods > 0 ? ` repeat(${extraPeriods}, 2.2rem)` : ""}`;
    $$renderer2.push(`<div class="mb-2 border border-white/10 rounded text-xs swipe-area"><div class="grid"${attr_style(`grid-template-columns: ${stringify(gridCols)}`)}><div class="sticky-col px-2 py-1 font-semibold text-left">TEAM</div> <div></div> <!--[-->`);
    const each_array = ensure_array_like([1, 2, 3, 4]);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let i = each_array[$$index];
      $$renderer2.push(`<div class="px-2 py-1 text-right font-semibold">Q${escape_html(i)}</div>`);
    }
    $$renderer2.push(`<!--]--> <div class="px-2 py-1 text-right font-semibold">TOT</div> <!--[-->`);
    const each_array_1 = ensure_array_like(Array(extraPeriods));
    for (let i = 0, $$length = each_array_1.length; i < $$length; i++) {
      each_array_1[i];
      $$renderer2.push(`<div class="px-2 py-1 text-right font-semibold">OT${escape_html(i + 1)}</div>`);
    }
    $$renderer2.push(`<!--]--> <div class="sticky-col px-2 py-1 text-left">${escape_html(abbr(linescores?.away?.team))}</div> <div></div> <!--[-->`);
    const each_array_2 = ensure_array_like([0, 1, 2, 3]);
    for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
      let i = each_array_2[$$index_2];
      $$renderer2.push(`<div class="px-2 py-1 text-right">${escape_html(linescores?.away?.periods?.[i] ?? "")}</div>`);
    }
    $$renderer2.push(`<!--]--> <div class="px-2 py-1 text-right font-semibold">${escape_html(linescores?.away?.total)}</div> <!--[-->`);
    const each_array_3 = ensure_array_like(Array(extraPeriods));
    for (let i = 0, $$length = each_array_3.length; i < $$length; i++) {
      each_array_3[i];
      $$renderer2.push(`<div class="px-2 py-1 text-right">${escape_html(linescores?.away?.periods?.[i + 4] ?? "")}</div>`);
    }
    $$renderer2.push(`<!--]--> <div class="sticky-col px-2 py-1 text-left">${escape_html(abbr(linescores?.home?.team))}</div> <div></div> <!--[-->`);
    const each_array_4 = ensure_array_like([0, 1, 2, 3]);
    for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
      let i = each_array_4[$$index_4];
      $$renderer2.push(`<div class="px-2 py-1 text-right">${escape_html(linescores?.home?.periods?.[i] ?? "")}</div>`);
    }
    $$renderer2.push(`<!--]--> <div class="px-2 py-1 text-right font-semibold">${escape_html(linescores?.home?.total)}</div> <!--[-->`);
    const each_array_5 = ensure_array_like(Array(extraPeriods));
    for (let i = 0, $$length = each_array_5.length; i < $$length; i++) {
      each_array_5[i];
      $$renderer2.push(`<div class="px-2 py-1 text-right">${escape_html(linescores?.home?.periods?.[i + 4] ?? "")}</div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
    bind_props($$props, { linescores });
  });
}
function BoxScoreToggle($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let roster, awayAb, homeAb;
    let eventId = $$props["eventId"];
    let players = $$props["players"];
    let linescores = $$props["linescores"];
    let side = "away";
    let mode = "STATS";
    function setMode(v) {
      if (mode === v) return;
      mode = v;
      try {
        localStorage.setItem(`arrnba.viewMode.${eventId}`, v);
      } catch {
      }
    }
    function cycleMode(direction) {
      if (direction === "right") {
        if (mode === "STATS") setMode("LIVE");
        else if (mode === "LIVE") setMode("POST");
        else setMode("STATS");
        return;
      }
      if (mode === "STATS") setMode("POST");
      else if (mode === "POST") setMode("LIVE");
      else setMode("STATS");
    }
    createTouchGestures({
      onSwipeRight: () => cycleMode("right"),
      onSwipeLeft: () => cycleMode("left"),
      threshold: 50
    });
    function abbr(team) {
      return team?.abbreviation || team?.shortDisplayName || (team?.displayName ? team.displayName.split(" ").map((w) => w[0]).join("").toUpperCase() : "");
    }
    roster = players?.[side] ?? [];
    awayAb = linescores?.away?.team ? abbr(linescores.away.team) : "";
    homeAb = linescores?.home?.team ? abbr(linescores.home.team) : "";
    $$renderer2.push(`<div><div class="grid grid-cols-3 gap-2 mb-2 swipe-area"><div class="text-center"><button${attr_class(`w-full py-2 font-semibold ${stringify(mode === "LIVE" ? "text-white" : "text-white/70")}`)}>LIVE</button> <div${attr_class(`${stringify(mode === "LIVE" ? "bg-white" : "bg-transparent")} h-0.5 w-full mt-2`)}></div></div> <div class="text-center"><button${attr_class(`w-full py-2 font-semibold ${stringify(mode === "STATS" ? "text-white" : "text-white/70")}`)}>STATS</button> <div${attr_class(`${stringify(mode === "STATS" ? "bg-white" : "bg-transparent")} h-0.5 w-full mt-2`)}></div></div> <div class="text-center"><button${attr_class(`w-full py-2 font-semibold ${stringify(mode === "POST" ? "text-white" : "text-white/70")}`)}>POST</button> <div${attr_class(`${stringify(mode === "POST" ? "bg-white" : "bg-transparent")} h-0.5 w-full mt-2`)}></div></div></div> `);
    if (mode === "STATS" && linescores) {
      $$renderer2.push("<!--[-->");
      LinescoreTable($$renderer2, { linescores });
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (mode === "STATS" && linescores) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="grid grid-cols-2 gap-2 mb-2 swipe-area"><button${attr_class(`w-full py-2 rounded font-semibold ${stringify(
        "bg-white/25 text-white"
      )}`)}>${escape_html(awayAb)}</button> <button${attr_class(`w-full py-2 rounded font-semibold ${stringify("bg-black text-white border border-white/20")}`)}>${escape_html(homeAb)}</button></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (mode === "STATS" && players) {
      $$renderer2.push("<!--[-->");
      StatsTable($$renderer2, { players: roster });
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div${attr_class(`${stringify(mode === "STATS" ? "hidden" : "")} swipe-area`)}><!--[-->`);
    slot($$renderer2, $$props, "reddit", { mode, side });
    $$renderer2.push(`<!--]--></div></div>`);
    bind_props($$props, { eventId, players, linescores });
  });
}
function RedditFeedClient($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let currentMode, thread, comments;
    let awayName = $$props["awayName"];
    let homeName = $$props["homeName"];
    let mode = $$props["mode"];
    let sortChoice = "new";
    let loading = false;
    let errorMsg = "";
    let triedFetch = { LIVE: false, POST: false };
    let commentsRequestSeq = 0;
    let cache = {
      LIVE: { thread: null, comments: [] },
      POST: { thread: null, comments: [] }
    };
    async function fetchCommentsFor(post, sort, targetMode, forceRefresh = false) {
      if (!post?.id) return;
      const requestId = ++commentsRequestSeq;
      errorMsg = "";
      if (!cache[targetMode].comments.length) {
        loading = true;
      }
      try {
        const result = await nbaService.getRedditComments(post.id, sort, post.permalink, forceRefresh);
        if (requestId !== commentsRequestSeq || mode !== targetMode) return;
        cache[targetMode].comments = sortedCopy(result.comments ?? [], sortChoice);
        cache = { ...cache };
      } catch (error) {
        if (requestId !== commentsRequestSeq || mode !== targetMode) return;
        console.error("Failed to fetch comments:", error);
        errorMsg = error instanceof Error ? error.message : "Failed to fetch comments";
      } finally {
        if (requestId === commentsRequestSeq && mode === targetMode) loading = false;
      }
    }
    async function ensureThreadAndComments(targetMode) {
      const sort = targetMode === "POST" ? "top" : "new";
      try {
        const mapping = await nbaService.getRedditIndex();
        const entry = mapping[createPairKey(awayName, homeName)];
        let post = targetMode === "POST" ? entry?.pgt : entry?.gdt;
        if (post) {
          cache[targetMode].thread = post;
          cache = { ...cache };
          await fetchCommentsFor(post, sort, targetMode);
          return;
        }
        if (!triedFetch[targetMode]) {
          triedFetch[targetMode] = true;
          if (!cache[targetMode].thread) loading = true;
          const result = await nbaService.searchRedditThread({
            type: targetMode === "POST" ? "post" : "live",
            awayCandidates: [awayName],
            homeCandidates: [homeName]
          });
          post = result?.post ?? null;
          if (post) {
            cache[targetMode].thread = post;
            cache = { ...cache };
            await fetchCommentsFor(post, sort, targetMode);
          } else if (mode === targetMode) {
            cache[targetMode].thread = null;
            cache[targetMode].comments = [];
            cache = { ...cache };
            loading = false;
          }
        } else if (mode === targetMode && !cache[targetMode].thread) {
          cache[targetMode].comments = [];
          cache = { ...cache };
          loading = false;
        }
      } catch (error) {
        console.error(`Error ensuring ${targetMode} thread:`, error);
        if (mode === targetMode) loading = false;
      }
    }
    function sortedCopy(base, choice) {
      const cmp = (a, b) => {
        if (choice === "top") return (b?.score ?? 0) - (a?.score ?? 0);
        return (b?.created_utc ?? 0) - (a?.created_utc ?? 0);
      };
      function cloneAndSort(nodes) {
        const copy = (nodes || []).map((node) => ({ ...node, replies: cloneAndSort(node?.replies || []) }));
        copy.sort(cmp);
        return copy;
      }
      return cloneAndSort(base || []);
    }
    currentMode = mode === "LIVE" || mode === "POST" ? mode : null;
    thread = currentMode ? cache[currentMode].thread : null;
    comments = currentMode ? cache[currentMode].comments : [];
    if (mode === "LIVE" || mode === "POST") {
      const defaultSort = mode === "POST" ? "top" : "new";
      sortChoice = defaultSort;
      ensureThreadAndComments(mode);
    } else {
      loading = false;
    }
    $$renderer2.push(`<div><div class="flex items-center justify-between mb-3"><div class="flex items-center gap-2 text-xs font-semibold"><button${attr_class(`px-3 py-1 rounded ${stringify(sortChoice === "new" ? "bg-white/25 text-white" : "bg-black text-white border border-white/20")}`)}>NEW</button> <button${attr_class(`px-3 py-1 rounded ${stringify(sortChoice === "top" ? "bg-white/25 text-white" : "bg-black text-white border border-white/20")}`)}>TOP</button> <button class="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white">REFRESH</button></div> `);
    if (thread) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<a class="text-white/70 hover:text-white underline"${attr("href", thread.url || (thread.permalink ? `https://www.reddit.com${thread.permalink}` : `https://www.reddit.com/comments/${thread.id}`))} target="_blank" rel="noopener noreferrer">Open Thread</a>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    if (loading) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="text-white/70 flex items-center gap-2"><div class="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div> Loading comments...</div>`);
    } else if (errorMsg) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="bg-red-900/20 border border-red-500/50 rounded p-3 mb-3"><div class="text-red-400 font-semibold mb-1">Reddit Error</div> <div class="text-sm text-red-300/80">${escape_html(errorMsg)}</div> <button class="mt-2 text-xs underline text-red-400 hover:text-red-300">Try again</button></div>`);
    } else if (!thread) {
      $$renderer2.push("<!--[2-->");
      $$renderer2.push(`<div class="text-white/70">No comments yet.</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="space-y-3"><!--[-->`);
      const each_array = ensure_array_like(comments);
      for (let i = 0, $$length = each_array.length; i < $$length; i++) {
        let c = each_array[i];
        $$renderer2.push(`<div role="button" tabindex="0" class="w-full text-left border border-white/10 rounded p-2 cursor-pointer"><div class="text-sm text-white/70">${escape_html(c.author)} - ${escape_html(c.score)} - ${escape_html(formatTimeAgo(c.created_utc))} ${escape_html(c._collapsed ? "- collapsed" : "")}</div> `);
        if (!c._collapsed) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="mt-1 whitespace-pre-wrap">${escape_html(c.body)}</div> `);
          if (c.replies && c.replies.length) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div class="mt-2 pl-3 border-l border-white/10 space-y-2"><!--[-->`);
            const each_array_1 = ensure_array_like(c.replies);
            for (let j = 0, $$length2 = each_array_1.length; j < $$length2; j++) {
              let r = each_array_1[j];
              $$renderer2.push(`<div role="button" tabindex="0" class="w-full text-left cursor-pointer"><div class="text-sm text-white/70">${escape_html(r.author)} - ${escape_html(r.score)} - ${escape_html(formatTimeAgo(r.created_utc))} ${escape_html(r._collapsed ? "- collapsed" : "")}</div> `);
              if (!r._collapsed) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<div class="whitespace-pre-wrap">${escape_html(r.body)}</div> `);
                if (r.replies && r.replies.length) {
                  $$renderer2.push("<!--[-->");
                  $$renderer2.push(`<div class="mt-2 pl-3 border-l border-white/10 space-y-2"><!--[-->`);
                  const each_array_2 = ensure_array_like(r.replies);
                  for (let k = 0, $$length3 = each_array_2.length; k < $$length3; k++) {
                    let rr = each_array_2[k];
                    $$renderer2.push(`<div role="button" tabindex="0" class="w-full text-left cursor-pointer"><div class="text-sm text-white/70">${escape_html(rr.author)} - ${escape_html(rr.score)} - ${escape_html(formatTimeAgo(rr.created_utc))} ${escape_html(rr._collapsed ? "- collapsed" : "")}</div> `);
                    if (!rr._collapsed) {
                      $$renderer2.push("<!--[-->");
                      $$renderer2.push(`<div class="whitespace-pre-wrap">${escape_html(rr.body)}</div>`);
                    } else {
                      $$renderer2.push("<!--[!-->");
                    }
                    $$renderer2.push(`<!--]--></div>`);
                  }
                  $$renderer2.push(`<!--]--></div>`);
                } else {
                  $$renderer2.push("<!--[!-->");
                }
                $$renderer2.push(`<!--]-->`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--></div>`);
            }
            $$renderer2.push(`<!--]--></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]-->`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
    bind_props($$props, { awayName, homeName, mode });
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let data = $$props["data"];
    let payload = null;
    let handledStreamedPayload;
    onDestroy(() => {
    });
    function formatStatus(s) {
      const str = (s || "").trim();
      if (!str) return "";
      const m = /Q(\d)\s+([0-9:]+)/i.exec(str);
      if (m) {
        const q = m[1];
        const clock = m[2];
        return `${clock} Q${q}`;
      }
      return str.toUpperCase();
    }
    if (data.streamed?.payload) {
      const streamedPayload = data.streamed.payload;
      if (streamedPayload === handledStreamedPayload) ;
      else {
        handledStreamedPayload = streamedPayload;
        streamedPayload.then((res) => {
          if (!payload) payload = res;
        }).catch((err) => {
          console.error("Failed to load streamed payload:", err);
        });
      }
    }
    $$renderer2.push(`<div class="p-4"><button class="text-white/70 hover:text-white">Back</button> <div class="mt-2 mb-2 min-h-[60px] swipe-area">`);
    if (
      // If payload is still null, try refreshing immediately on client
      // Continue with periodic refresh
      // Refresh Reddit every 30 seconds
      payload?.linescores
    ) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center justify-between text-lg font-semibold"><div class="flex items-center gap-2"><img${attr("src", `/logos/${getTeamLogoAbbr(payload?.linescores?.away?.team)}.svg`)} alt="away" width="28" height="28" loading="eager" decoding="async"/> <span>${escape_html(getTeamLogoAbbr(payload?.linescores?.away?.team))}</span></div> <span>${escape_html(payload?.linescores?.away?.total)} - ${escape_html(payload?.linescores?.home?.total)}</span> <div class="flex items-center gap-2"><span>${escape_html(getTeamLogoAbbr(payload?.linescores?.home?.team))}</span> <img${attr("src", `/logos/${getTeamLogoAbbr(payload?.linescores?.home?.team)}.svg`)} alt="home" width="28" height="28" loading="eager" decoding="async"/></div></div> <div class="text-center text-white/70 text-sm mt-1">`);
      if (payload?.status?.name && payload?.status?.name?.toUpperCase()?.includes("FINAL")) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`FINAL`);
      } else if (payload?.status?.short) {
        $$renderer2.push("<!--[1-->");
        $$renderer2.push(`${escape_html(formatStatus(payload?.status?.short))}`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`${escape_html(formatStatus(payload?.status?.clock && payload?.status?.period ? `Q${payload?.status?.period} ${payload?.status?.clock}` : ""))}`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    if (payload?.error && !payload?.linescores) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="text-red-400">${escape_html(payload.error)}</div>`);
    } else if (payload?.linescores) {
      $$renderer2.push("<!--[1-->");
      BoxScoreToggle($$renderer2, {
        eventId: payload.id,
        players: payload.players,
        linescores: payload.linescores,
        $$slots: {
          reddit: ($$renderer3, { mode, side }) => {
            $$renderer3.push(`<div slot="reddit">`);
            RedditFeedClient($$renderer3, {
              awayName: payload?.linescores?.away?.team?.displayName,
              homeName: payload?.linescores?.home?.team?.displayName,
              mode
            });
            $$renderer3.push(`<!----></div>`);
          }
        }
      });
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="flex items-center justify-center py-8"><div class="animate-spin w-8 h-8 border-4 border-white/10 border-t-white/70 rounded-full"></div></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
    bind_props($$props, { data });
  });
}
export {
  _page as default
};
