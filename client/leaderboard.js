import { escape } from "./text.js";
import { icon } from "./icons.js";
export function scoreboard(s) {
  return `<section class="panel scoreboard"><div class="panel-heading"><div><h2>Xal cədvəli</h2><p>Ümumi xala görə azalan sıra</p></div>${icon("trophy")}</div>${s.scoreboard.length ? s.scoreboard.map((p, i) => `<div class="score-row"><span class="score-rank">${i + 1}.</span><span class="avatar color-${i % 4}">${escape(p.name.charAt(0))}</span><span>${escape(p.name)}<small>${p.connected ? "Onlayn" : "Oflayn"}</small></span><b class="${p.points < 0 ? "negative-score" : ""}">${p.points} xal</b></div>`).join("") : '<p class="brain-empty">Oyunçuları dəvət edin.</p>'}</section>`;
}
