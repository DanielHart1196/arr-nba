import { x as ensure_array_like, y as bind_props } from "../../chunks/index.js";
import { o as onDestroy, g as getTeamLogoAbbr } from "../../chunks/team.utils.js";
import { e as escape_html } from "../../chunks/escaping.js";
import { a as attr } from "../../chunks/attributes.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let data = $$props["data"];
    let events = data.events ?? [];
    let selectedDate = /* @__PURE__ */ new Date();
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
    $$renderer2.push(`<div class="p-4 min-h-screen swipe-area" style="touch-action: pan-y;"><div class="flex items-center justify-between mb-4"><h1 class="text-2xl font-semibold">ARR NBA</h1> <div class="flex items-center gap-2"><div class="flex items-center bg-white/5 border border-white/10 rounded overflow-hidden"><button class="px-3 py-1 hover:bg-white/10 border-r border-white/10">Prev</button> <span class="px-4 py-1 text-sm font-medium min-w-[200px] text-center">${escape_html(formatDateDisplay(selectedDate))}</span> <button class="px-3 py-1 hover:bg-white/10 border-l border-white/10">Next</button></div> <button class="px-3 py-1 rounded border border-white/10 bg-white/10 text-white/90">${escape_html("Hide Scores")}</button></div></div> `);
    if (!events || events.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="text-white/70">No games found...</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"><!--[-->`);
      const each_array = ensure_array_like(events);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let e = each_array[$$index];
        $$renderer2.push(`<a${attr("href", `/game/${e.id}`)} class="block border border-white/10 rounded p-3 hover:border-white/20"><div class="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-x-2 items-center"><div class="row-span-2 justify-self-center"><img${attr("src", `/logos/${getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c) => c.homeAway === "away")?.team)}.svg`)} alt="away" width="48" height="48" loading="lazy" decoding="async"/></div> <div class="text-center font-medium">${escape_html(getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c) => c.homeAway === "away")?.team))}</div> <div class="text-center text-white/70 font-medium">@</div> <div class="text-center font-medium">${escape_html(getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c) => c.homeAway === "home")?.team))}</div> <div class="row-span-2 justify-self-center"><img${attr("src", `/logos/${getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c) => c.homeAway === "home")?.team)}.svg`)} alt="home" width="48" height="48" loading="lazy" decoding="async"/></div> <div class="text-center">${escape_html(e?.competitions?.[0]?.status?.type?.name === "STATUS_SCHEDULED" || hideScores ? "-" : e?.competitions?.[0]?.competitors?.find((c) => c.homeAway === "away")?.score ?? 0)}</div> <div class="text-center text-white/70 whitespace-nowrap">`);
        if (e?.competitions?.[0]?.status?.type?.name === "STATUS_SCHEDULED") {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`${escape_html(formatLocalTime(e.date))}`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`${escape_html(e?.competitions?.[0]?.status?.type?.shortDetail)}`);
        }
        $$renderer2.push(`<!--]--></div> <div class="text-center">${escape_html(e?.competitions?.[0]?.status?.type?.name === "STATUS_SCHEDULED" || hideScores ? "-" : e?.competitions?.[0]?.competitors?.find((c) => c.homeAway === "home")?.score ?? 0)}</div></div></a>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
    bind_props($$props, { data });
  });
}
export {
  _page as default
};
