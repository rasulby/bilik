import { escape } from "./text.js";
import { icon } from "./icons.js";
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const button = (label, action, disabled = false, style = "") =>
  `<button class="button ${style}" data-action="${action}" ${disabled ? "disabled" : ""}>${label}</button>`;
export function xemseControls(s) {
  const open = s.status === "ANSWERING_OPEN",
    finished = s.status === "ROUND_FINISHED",
    candidate = open && s.currentCandidate;
  const nominalEnabled =
    !s.nominalLocked && s.questionNumber === 1 && s.status === "WAITING";
  return `<section class="panel xemse-controls"><div class="panel-heading"><div><h2>Xəmsə · Mərhələ ${s.stageNumber}</h2><p>Hər mərhələdə 5 sual · xal avtomatik hesablanır</p></div><span class="round-chip">${open ? "Cavab qəbulu açıqdır" : finished ? "Sual bitdi" : "Başlamağı gözləyir"}</span></div>
  <div class="nominal-panel"><span>Mərhələ nominalı: <b>${s.nominalPoints} xal</b></span><div class="nominal-buttons">${[100, 200, 300].map((n) => `<button class="point-button ${n === s.nominalPoints ? "selected" : ""}" data-nominal="${n}" aria-pressed="${n === s.nominalPoints}" ${nominalEnabled ? "" : "disabled"}>${n}</button>`).join("")}</div><form id="nominal-form"><label for="nominal">Digər nominal</label><input id="nominal" name="nominal" type="number" min="1" max="1000000" step="1" value="${s.nominalPoints}" required ${nominalEnabled ? "" : "disabled"}><button class="button" ${nominalEnabled ? "" : "disabled"}>Tətbiq et</button></form><small>Nominalı ilk sual başlamazdan əvvəl seçin.</small></div>
  <div class="question-value"><span>Mərhələ ${s.stageNumber}</span><h3>Sual ${s.questionNumber} / 5 — ${s.questionPoints} xal</h3><p>${s.nominalPoints} × ${s.questionNumber} = ${s.questionPoints}</p></div>
  <div class="stage-steps" aria-label="Mərhələnin sualları">${[1, 2, 3, 4, 5].map((n) => `<div class="${n === s.questionNumber ? "current" : n < s.questionNumber ? "completed" : ""}"><b>${n}</b><span>${s.nominalPoints * n} xal</span></div>`).join("")}</div>
  <div class="candidate-card ${candidate ? "has-candidate" : ""}"><span>${icon("users")}</span><div><small>Cari cavab verən</small><h3>${candidate ? `Cavab verir: ${escape(candidate.name)}` : open ? "İlk cavabı gözləyirik" : "Cavab verən oyunçu yoxdur"}</h3></div></div>
  <div class="judgment-buttons">${button("+ Düzgün", "correct", !candidate, "primary")}${button("- Səhv", "incorrect", !candidate, "danger")}</div><div class="scoring-hint">Düzgün: +${s.questionPoints} xal · Səhv: −${s.questionPoints} xal</div>
  ${s.questionResult ? `<div class="brain-result" role="status">${escape(s.questionResult.name)} — Düzgün cavab — +${s.questionResult.points} xal</div>` : ""}
  <div class="brain-flow-actions">${s.status === "WAITING" ? button("Sualı başlat", "start", false, "primary") : button("Sualı bitir", "finish", !open)}${button("Növbəti sual", "next", !finished || s.questionNumber === 5)}${button("Növbəti mərhələ", "nextStage", !finished || s.questionNumber !== 5)}</div>
  <div class="brain-restart">${button("Sualı sıfırla", "reset", false, "ghost")}${button("Yenidən başlat", "restart", false, "danger ghost")}</div></section>`;
}
export function xemseOrder(s) {
  return `<section class="panel order-panel"><div class="panel-heading"><div><h2>Cavab sıralaması</h2><p>Serverin qeydə aldığı buzzer sırası</p></div><span class="live-badge"><i></i>Canlı nəticələr</span></div>${
    s.order.length
      ? `<div class="brain-order">${s.order
          .map((r) => {
            const answer = s.answerHistory.find(
              (a) => a.playerId === r.playerId,
            );
            return `<div class="brain-order-row"><b>${r.position}</b><span>${escape(r.name)}</span><small class="${answer?.points < 0 ? "negative-score" : ""}">${answer ? `${answer.outcome === "correct" ? "Düzgün" : "Səhv"} · ${signed(answer.points)} xal` : s.currentCandidate?.playerId === r.playerId ? "Cavab verir" : s.status === "ANSWERING_OPEN" ? "Növbədədir" : "Növbə bağlandı"}</small></div>`;
          })
          .join("")}</div>`
      : '<div class="empty-order"><h3>İlk cavabı gözləyirik</h3><p>Oyunçular cavab verdikcə sıralama burada görünəcək.</p></div>'
  }</section>`;
}
export function xemsePlayer(s, playerId, enabled, ordinal) {
  const result = s.order.find((r) => r.playerId === playerId),
    answer = s.answerHistory.find((r) => r.playerId === playerId);
  return `<div class="player-question-value">Sual ${s.questionNumber} / 5 — <strong>${s.questionPoints} xal</strong></div>${result ? `<div class="player-result">${icon("trophy")}<strong>${result.position}</strong><h2>Siz ${ordinal(result.position)} oldunuz</h2><p class="${answer?.points < 0 ? "negative-score" : ""}">${answer ? `${answer.outcome === "correct" ? "Cavab düzgündür" : "Cavab səhvdir"} · ${signed(answer.points)} xal` : s.currentCandidate?.playerId === playerId ? "Cavab vermək hüququ sizdədir" : s.status === "ANSWERING_OPEN" ? "Növbənizi gözləyin." : "Növbəti sualı gözləyin."}</p></div>` : `<button class="buzzer" id="buzz" ${enabled ? "" : "disabled"}>${icon("bolt")}<strong>CAVAB VER</strong><span>${enabled ? "Hazırsınız? Düyməyə toxunun." : "Adminin sualı başlatmasını gözləyin."}</span></button>`}`;
}
