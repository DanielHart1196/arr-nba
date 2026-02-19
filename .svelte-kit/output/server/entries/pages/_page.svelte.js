import { x as attr_class, y as attr_style, z as ensure_array_like, F as bind_props, G as stringify } from "../../chunks/index.js";
import { o as onDestroy, g as getTeamLogoAbbr } from "../../chunks/team.utils.js";
import { e as escape_html } from "../../chunks/escaping.js";
import { a as attr } from "../../chunks/attributes.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let data = $$props["data"];
    let events = data.events ?? [];
    let selectedDate = /* @__PURE__ */ new Date();
    let gameCards = [];
    let prevCards = [];
    let nextCards = [];
    let trackOffsetPx = 0;
    function formatDateDisplay(date) {
      return date.toLocaleDateString(void 0, { weekday: "long", month: "short", day: "numeric" });
    }
    onDestroy(() => {
    });
    function formatLocalTime(dateStr) {
      try {
        const date = new Date(dateStr);
        const timeStr = date.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit", hour12: false });
        const tzStr = date.toLocaleTimeString("en-AU", { timeZoneName: "short" }).split(" ").pop();
        return `${timeStr} ${tzStr}`;
      } catch {
        return "";
      }
    }
    let hideScores = false;
    function getCompetitor(event, side) {
      return event?.competitions?.[0]?.competitors?.find((c) => c.homeAway === side);
    }
    function toGameCard(event, scoresHidden) {
      const away = getCompetitor(event, "away");
      const home = getCompetitor(event, "home");
      const statusName = event?.competitions?.[0]?.status?.type?.name ?? "";
      const scheduled = statusName === "STATUS_SCHEDULED";
      const awayAbbr = getTeamLogoAbbr(away?.team);
      const homeAbbr = getTeamLogoAbbr(home?.team);
      return {
        id: event.id,
        event,
        awayAbbr,
        homeAbbr,
        awayLogo: `/logos/${awayAbbr}.svg`,
        homeLogo: `/logos/${homeAbbr}.svg`,
        awayScore: scheduled || scoresHidden ? "-" : away?.score ?? 0,
        homeScore: scheduled || scoresHidden ? "-" : home?.score ?? 0,
        statusText: scheduled ? formatLocalTime(event.date) : event?.competitions?.[0]?.status?.type?.shortDetail ?? "",
        scheduled
      };
    }
    gameCards = events.map((event) => toGameCard(event, hideScores));
    $$renderer2.push(`<div class="p-4 min-h-screen swipe-area" style="touch-action: pan-y;"><div class="grid grid-cols-[1fr_auto_1fr] items-end mb-4" data-no-swipe="true"><div></div> <div class="justify-self-center" data-no-swipe="true"><div class="flex items-center bg-white/5 border border-white/10 rounded overflow-hidden"><button data-no-swipe="true" class="px-2.5 py-1 hover:bg-white/10 border-r border-white/10">&lt;</button> <span class="px-3 py-1 text-sm font-medium min-w-[140px] text-center">${escape_html(formatDateDisplay(selectedDate))}</span> <button data-no-swipe="true" class="px-2.5 py-1 hover:bg-white/10 border-l border-white/10">></button></div></div> <div class="justify-self-end" data-no-swipe="true"><div class="flex flex-col items-center gap-1 select-none"><span class="text-[11px] text-white/70 leading-none">Scores</span> <button data-no-swipe="true" type="button" role="switch" aria-label="Toggle scores visibility"${attr("aria-checked", !hideScores)}${attr_class(`relative h-5 w-10 rounded-full border border-white/15 transition-colors ${stringify("bg-[#4b5563]")}`)}><span${attr_class(`pointer-events-none absolute left-[2px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white transition-transform duration-200 ${stringify("translate-x-5")}`)}></span></button></div></div></div> `);
    if (!events || events.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="text-white/70">No games found...</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="relative overflow-hidden"><div class="flex w-[300%]"${attr_style(`transform: translate3d(calc(-33.333333% + ${stringify(trackOffsetPx)}px), 0, 0); transition: ${stringify("transform 180ms ease-out")};`)}><!--[-->`);
      const each_array = ensure_array_like([prevCards, gameCards, nextCards]);
      for (let paneIndex = 0, $$length = each_array.length; paneIndex < $$length; paneIndex++) {
        let paneCards = each_array[paneIndex];
        $$renderer2.push(`<div class="w-1/3 shrink-0 px-0.5"><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">`);
        if (paneCards.length === 0) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="text-white/70">No games found...</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<!--[-->`);
          const each_array_1 = ensure_array_like(paneCards);
          for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
            let game = each_array_1[$$index];
            if (paneIndex === 1) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<a${attr("href", `/game/${game.id}`)} class="block border border-white/10 rounded p-3 hover:border-white/20"><div class="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-x-2 items-center"><div class="row-span-2 justify-self-center"><img${attr("src", game.awayLogo)} alt="away" width="48" height="48" loading="lazy" decoding="async"/></div> <div class="text-center font-medium">${escape_html(game.awayAbbr)}</div> <div class="text-center text-white/70 font-medium">@</div> <div class="text-center font-medium">${escape_html(game.homeAbbr)}</div> <div class="row-span-2 justify-self-center"><img${attr("src", game.homeLogo)} alt="home" width="48" height="48" loading="lazy" decoding="async"/></div> <div class="text-center">${escape_html(game.awayScore)}</div> <div class="text-center text-white/70 whitespace-nowrap">${escape_html(game.statusText)}</div> <div class="text-center">${escape_html(game.homeScore)}</div></div></a>`);
            } else {
              $$renderer2.push("<!--[!-->");
              $$renderer2.push(`<div class="block border border-white/10 rounded p-3"><div class="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-x-2 items-center"><div class="row-span-2 justify-self-center"><img${attr("src", game.awayLogo)} alt="away" width="48" height="48" loading="lazy" decoding="async"/></div> <div class="text-center font-medium">${escape_html(game.awayAbbr)}</div> <div class="text-center text-white/70 font-medium">@</div> <div class="text-center font-medium">${escape_html(game.homeAbbr)}</div> <div class="row-span-2 justify-self-center"><img${attr("src", game.homeLogo)} alt="home" width="48" height="48" loading="lazy" decoding="async"/></div> <div class="text-center">${escape_html(game.awayScore)}</div> <div class="text-center text-white/70 whitespace-nowrap">${escape_html(game.statusText)}</div> <div class="text-center">${escape_html(game.homeScore)}</div></div></div>`);
            }
            $$renderer2.push(`<!--]-->`);
          }
          $$renderer2.push(`<!--]-->`);
        }
        $$renderer2.push(`<!--]--></div></div>`);
      }
      $$renderer2.push(`<!--]--></div></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
    bind_props($$props, { data });
  });
}
export {
  _page as default
};
