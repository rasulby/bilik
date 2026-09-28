import { escape } from "./text.js";
import { icon } from "./icons.js";
export const brainStatuses = {
  WAITING: "Başlamağı gözləyir",
  READING_QUESTION: "Sual oxunur",
  ANSWERING_OPEN: "Vaxt başladı",
  ANSWER_PENDING: "Cavab gözlənilir",
  POINTS_PENDING: "Xal təsdiqi gözlənilir",
  QUESTION_FINISHED: "Növbəti sual gözlənilir",
  ROUND_FINISHED: "Raund bitdi",
};
export const timerText = (ms) => (Math.max(0, ms) / 1000).toFixed(1);
const resultText = (result) =>
  !result
    ? ""
    : result.reason === "correct"
      ? `${escape(result.name)} — Düzgün cavab — +${result.points} xal`
      : result.reason === "timeout"
        ? "Vaxt bitdi"
        : result.reason === "removed"
          ? "Cavab verən oyunçu silindi"
          : "Sual bitirildi";
const action = (label, name, disabled = false, style = "") =>
  `<button class="button ${style}" data-brain-action="${name}" ${disabled ? "disabled" : ""}>${label}</button>`;
function pointPicker(value, award = false, disabled = false) {
  const key = award ? "award" : "question";
  return `<div class="point-picker"><div class="point-quick">${[1, 2, 3].map((n) => `<button class="point-button ${n === value ? "selected" : ""}" aria-pressed="${n === value}" data-points="${n}" data-point-kind="${key}" ${disabled ? "disabled" : ""}>${award ? "+" + n : n + " xal"}</button>`).join("")}</div><form data-custom-points="${key}"><label for="${key}-points">Digər xal</label><input type="number" id="${key}-points" name="points" min="1" max="10000" step="1" value="${value}" required ${disabled ? "disabled" : ""}><button class="button" ${disabled ? "disabled" : ""}>Tətbiq et</button></form></div>`;
}
export function brainControls(s) {
  const pending = s.status === "ANSWER_PENDING",
    award = s.status === "POINTS_PENDING";
  const finished = s.status === "QUESTION_FINISHED",
    roundFinished = s.status === "ROUND_FINISHED";
  const winner = s.roundHistory.find((r) => r.roundId === s.roundId)?.winner;
  return `<section class="panel brain-controls"><div class="panel-heading"><div><h2>Brain Ring · Canlı idarəetmə</h2><p>Raund ${s.round} · Sual ${s.questionNumber}</p></div><span class="round-chip">${brainStatuses[s.status]}</span></div>
    <div class="brain-live-row"><div class="brain-timer ${s.timer.running ? "running" : ""}"><strong data-brain-timer>${timerText(s.timer.remainingMs)}</strong><span>saniyə · ${s.timer.running ? "vaxt gedir" : "dayanıb"}</span></div><div class="brain-points"><span>Sualın dəyəri · <b>${s.questionPoints} xal</b></span>${pointPicker(s.questionPoints, false, !["WAITING", "READING_QUESTION", "ANSWERING_OPEN", "ANSWER_PENDING"].includes(s.status))}</div></div>
    <div class="candidate-card ${s.currentCandidate ? "has-candidate" : ""}"><span>${icon("users")}</span><div><small>${award ? "Cavab düzgündür · xalı təsdiqləyin" : "Cari cavab verən"}</small><h3>${s.currentCandidate ? `Cavab verir: ${escape(s.currentCandidate.name)}` : s.status === "READING_QUESTION" ? "Sualı səsləndirin" : s.status === "ANSWERING_OPEN" ? "İlk düyməni gözləyirik" : "Cavab verən oyunçu yoxdur"}</h3></div></div>
    <div class="judgment-buttons">${action("CAVAB DÜZGÜNDÜR", "correct", !pending, "primary")}${action("CAVAB SƏHVDİR", "incorrect", !pending, "danger")}</div>
    ${award ? `<div class="award-panel"><h3>Veriləcək xal: +${s.awardPoints}</h3>${pointPicker(s.awardPoints, true)}${action(`+${s.awardPoints} xal ver · Təsdiqlə`, "award", false, "primary wide")}</div>` : ""}
    ${s.questionResult ? `<div class="brain-result ${s.questionResult.reason === "timeout" ? "timeout" : ""}" role="status">${resultText(s.questionResult)}</div>` : ""}
    <div class="brain-flow-actions">${s.status === "WAITING" ? action("Raundu başlat", "start", false, "primary") : action("VAXT GETDİ", "open", s.status !== "READING_QUESTION", "primary")}${action("Növbəti sual", "next", !finished)}${action("Sualı bitir / keç", "endQuestion", !["READING_QUESTION", "ANSWERING_OPEN", "ANSWER_PENDING", "POINTS_PENDING"].includes(s.status))}${action("Raundu bitir", "finish", !finished)}</div>
    ${
      roundFinished
        ? `<div class="winner-panel"><h3>Raund qalibini seç</h3>${
            winner
              ? `<p class="winner-confirmed">Raund qalibi: ${escape(winner.name)}</p>`
              : `<form id="winner-form"><label for="winner">Onlayn oyunçu / komanda</label><select id="winner" name="winner" required><option value="">Qalibi seçin</option>${s.players
                  .filter((p) => p.connected)
                  .map(
                    (p) => `<option value="${p.id}">${escape(p.name)}</option>`,
                  )
                  .join(
                    "",
                  )}</select><button class="button primary" ${s.players.some((p) => p.connected) ? "" : "disabled"}>Qalib kimi təsdiqlə</button></form>`
          }${action("Yeni raundu başlat", "newRound", !winner)}</div>`
        : ""
    }
    <div class="brain-restart">${action("Yenidən başlat", "restart", false, "danger ghost")}<span>Qeydiyyat saxlanılır. Yarışmanın nəticələri sıfırlanır.</span></div>
  </section>`;
}
export function brainQueue(s) {
  return `<section class="panel brain-queue"><div class="panel-heading"><div><h2>Cavab növbəsi</h2><p>İlk gələn, ilk cavab verir. Qiymətləndirmə zamanı vaxt dayanır.</p></div><span class="count-chip">${s.buzzQueue.length} gözləyir</span></div>
    ${
      s.order.length
        ? `<div class="brain-order">${s.order
            .map((r) => {
              const answer = s.answerHistory.find(
                (a) => a.playerId === r.playerId,
              );
              const label = answer
                ? answer.outcome === "correct"
                  ? `Düzgün · +${answer.points} xal`
                  : answer.outcome === "removed"
                    ? "Silindi"
                    : "Səhv · 0 xal"
                : s.currentCandidate?.playerId === r.playerId
                  ? "Cavab verir"
                  : s.buzzQueue.some((q) => q.playerId === r.playerId)
                    ? "Növbədədir"
                    : "Növbə bağlandı";
              return `<div class="brain-order-row"><b>${r.position}</b><span>${escape(r.name)}</span><small>${label}</small></div>`;
            })
            .join("")}</div>`
        : '<p class="brain-empty">Hələ düyməyə basan yoxdur.</p>'
    }
    ${s.falseStarts.length ? `<div class="false-list"><strong>Erkən basma</strong>${s.falseStarts.map((r) => `<p>Erkən basma: ${escape(r.name)}</p>`).join("")}</div>` : ""}
  </section>`;
}
export function brainHistory(s) {
  return `<section class="panel brain-history"><div class="panel-heading"><div><h2>Raund qalibləri</h2><p>Qalibi yalnız admin müəyyən edir.</p></div></div>${s.roundHistory.length ? s.roundHistory.map((r) => `<p>Raund ${r.round} — <strong>${r.winner ? escape(r.winner.name) : "Qalib seçilməyib"}</strong></p>`).join("") : '<p class="brain-empty">Hələ tamamlanmış raund yoxdur.</p>'}
  ${s.questionHistory?.length ? `<details><summary>Sual tarixçəsi · ${s.questionHistory.length}</summary>${s.questionHistory.map((q) => `<div class="history-question"><b>Raund ${q.round} · Sual ${q.questionNumber}</b><p>${resultText(q.result)}</p>${q.answers.map((a) => `<small>${escape(a.name)} — ${a.outcome === "correct" ? `Düzgün · +${a.points} xal` : a.outcome === "incorrect" ? "Səhv" : "Silindi"}</small>`).join("")}</div>`).join("")}</details>` : ""}</section>`;
}
export function brainPlayer(s, playerId, busy) {
  const early = s.falseStarts.some((r) => r.playerId === playerId);
  const answer = s.answerHistory.find((r) => r.playerId === playerId);
  const current = s.currentCandidate?.playerId === playerId;
  const queued = s.buzzQueue.some((r) => r.playerId === playerId);
  const recorded = s.order.some((r) => r.playerId === playerId);
  const eligible =
    !early && !recorded && !s.attemptedPlayers.includes(playerId);
  const enabled =
    !busy &&
    eligible &&
    ["READING_QUESTION", "ANSWERING_OPEN", "ANSWER_PENDING"].includes(s.status);
  let message = brainStatuses[s.status];
  if (early) message = "ERKƏN BASMA";
  else if (answer)
    message =
      answer.outcome === "correct"
        ? `Cavab düzgündür · +${answer.points} xal`
        : answer.outcome === "incorrect"
          ? "Cavab səhvdir"
          : "Cavab ləğv edildi";
  else if (current)
    message =
      s.status === "POINTS_PENDING"
        ? "Cavab düzgündür · xal təsdiqi gözlənilir"
        : "Cavab vermək hüququ sizdədir";
  else if (queued) message = "Cavab gözlənilir · növbədəsiniz";
  else if (s.questionResult?.reason === "timeout") message = "Vaxt bitdi";
  const winner = s.roundHistory.find((r) => r.roundId === s.roundId)?.winner;
  return `<div class="brain-player-meta"><span>Sual ${s.questionNumber} · ${s.questionPoints} xal</span><span class="player-clock"><b data-brain-timer>${timerText(s.timer.remainingMs)}</b> san.</span></div>
    <div class="brain-player-status ${early ? "early" : current ? "your-turn" : ""}" role="status"><h2>${escape(message)}</h2>${early ? "<p>Vaxt başlamamış düyməyə basdınız. Növbəti sualı gözləyin.</p>" : queued ? "<p>Vaxt dayanıb. Admin əvvəlki cavabı qiymətləndirir.</p>" : ""}</div>
    <button class="buzzer" id="buzz" ${enabled ? "" : "disabled"}>${icon("bolt")}<strong>CAVAB VER</strong><span>${s.status === "READING_QUESTION" ? "Diqqət! VAXT GETDİ siqnalını gözləyin." : enabled ? "Hazırsınız? Düyməyə toxunun." : "Növbəti addımı gözləyin."}</span></button>
    ${winner ? `<div class="brain-result">Raund qalibi: ${escape(winner.name)}</div>` : ""}`;
}
