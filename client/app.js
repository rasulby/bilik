import { icon } from "./icons.js";
import { escape } from "./text.js";
import {
  brainControls,
  brainQueue,
  brainHistory,
  brainPlayer,
  brainStatuses,
  timerText,
} from "./brain.js";
import { scoreboard } from "./leaderboard.js";
import { xemseControls, xemseOrder, xemsePlayer } from "./xemse.js";
import { SoundEffects } from "./sounds.js";
const app = document.querySelector("#app");
const socket = io({ transports: ["websocket"] });
const adminRoute = location.pathname.startsWith("/admin");
const sounds = new SoundEffects({
  defaultEnabled: adminRoute,
  storageKey: adminRoute ? "bilik-sounds-admin" : "bilik-sounds-player",
});
for (const event of ["pointerdown", "keydown"])
  document.addEventListener(event, () => sounds.unlock(), { capture: true });
const soundButton = () =>
  `<button class="sound-toggle" data-sound-toggle aria-pressed="${sounds.enabled}">Səslər: ${sounds.enabled ? "Açıq" : "Bağlı"}</button>`;
const titles = { xemse: "Xəmsə", brain: "Brain Ring" };
const ordinal = (value) => {
  const endings = {
    1: "ci",
    2: "ci",
    3: "cü",
    4: "cü",
    5: "ci",
    6: "cı",
    7: "ci",
    8: "ci",
    9: "cu",
    10: "cu",
    20: "ci",
    30: "cu",
    40: "cı",
    50: "ci",
    60: "cı",
    70: "ci",
    80: "ci",
    90: "cı",
    100: "cü",
  };
  return `${value}-${endings[value % 10 || value % 100 || 100]}`;
};
const joinUrl = () =>
  ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
    ? state?.joinUrl || location.origin + "/"
    : location.origin + "/";
const descriptions = {
  xemse: "İlk basan, ilk cavablayar.",
  brain: "Diqqət, sürət və düzgün zamanlama.",
};
const statuses = {
  WAITING: "Başlamağı gözləyir",
  READING_QUESTION: "Sual oxunur",
  ANSWERING_OPEN: "Cavab qəbulu açıqdır",
  ROUND_FINISHED: "Raund bitdi",
};
const read = (storage, key) => {
  try {
    return JSON.parse(storage.getItem(key));
  } catch {
    return null;
  }
};
let identity = read(localStorage, "bilik-player"),
  password = read(sessionStorage, "bilik-admin"),
  authorized = false,
  state = null,
  page = "dashboard",
  pending = false;
let toastTimer;
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}
function send(event, payload) {
  return new Promise((resolve) =>
    socket.timeout(5000).emit(event, payload, (error, result) => {
      if (error) {
        toast("Server cavab vermədi. Yenidən cəhd edin.");
        resolve({ ok: false });
      } else {
        if (!result.ok) toast(result.error);
        resolve(result);
      }
    }),
  );
}
function connection() {
  return `<span class="connection ${socket.connected ? "" : "offline"}"><i></i>${socket.connected ? "Serverə qoşulub" : "Bağlantı kəsildi"}</span>`;
}
const button = (label, action, style = "", disabled = false, symbol = "") =>
  `<button class="button ${style}" data-action="${action}" ${disabled ? "disabled" : ""}>${symbol ? icon(symbol) : ""}${label}</button>`;
function brand() {
  return `<a class="brand" href="${adminRoute ? "/admin" : "/"}"><span class="brand-mark">${icon("bolt")}</span>bilik<span class="brand-dot">.</span></a>`;
}
function renderAuth() {
  app.innerHTML = `<div class="entry-shell"><header>${brand()}${connection()}</header><main class="entry-main"><div class="entry-intro"><span class="eyebrow">BİRLİKDƏ DÜŞÜN. BİRLİKDƏ YARIŞ.</span><h1>Bilik birləşdirir.<br><span>Həyəcan başlayır.</span></h1><p>Bir şəbəkə, iki oyun rejimi və ən sürətli cavablar.<br>Canlı bilik yarışmasına xoş gəlmisiniz.</p><div class="entry-modes">${icon("bolt")} Xəmsə <span>·</span> ${icon("ring")} Brain Ring</div><div class="orbit-art"><div class="orbit o1"></div><div class="orbit o2"></div><div class="orbit o3"></div><span class="art-core">${icon("bolt")}</span><span class="art-small s1">${icon("trophy")}</span><span class="art-small s2">${icon("ring")}</span><span class="art-caption">Hər cavab yeni bir başlanğıcdır.</span></div></div><section class="entry-card"><span class="entry-icon">${icon(adminRoute ? "shield" : "users")}</span><h2>${adminRoute ? "İdarəetmə paneli" : "Yarışmaya qoşulun"}</h2><p>${adminRoute ? "Yarışmanı idarə etmək üçün admin kodunu daxil edin." : "Adınızı daxil edin və oyunda yerinizi alın."}</p><form id="entry-form"><label for="credential">${adminRoute ? "Admin kodu" : "Adınız"}</label><input id="credential" name="credential" ${adminRoute ? 'type="password" autocomplete="current-password"' : 'autocomplete="given-name" maxlength="40"'} placeholder="${adminRoute ? "Admin kodunu daxil edin" : "Məsələn, Rəsul"}" required><button class="button primary wide" ${!socket.connected ? "disabled" : ""}>${adminRoute ? "Daxil ol" : "Yarışmaya qoşul"} ${icon("arrow")}</button></form><div class="entry-note">${icon("wifi")} Eyni Wi-Fi şəbəkəsində olduğunuzdan əmin olun.</div><a class="entry-switch" href="${adminRoute ? "/" : "/admin"}">${adminRoute ? "Oyunçu kimi qoşul" : "İdarəetmə panelinə keç"} ${icon("arrow")}</a></section></main><footer>Bilik Yarışması <span>Yaxşı suallar. Unudulmaz yarışlar.</span></footer></div>`;
  document.querySelector("#entry-form").onsubmit = async (e) => {
    e.preventDefault();
    const value = new FormData(e.target).get("credential");
    if (adminRoute) {
      const r = await send("login", { password: value });
      if (r.ok) {
        authorized = true;
        password = value;
        sessionStorage.setItem("bilik-admin", JSON.stringify(value));
        render();
      }
    } else {
      const r = await send("register", { name: value });
      if (r.ok) {
        identity = r;
        localStorage.setItem("bilik-player", JSON.stringify(r));
        render();
      }
    }
  };
}
function sidebar() {
  return `<aside class="sidebar">${brand()}<div class="workspace"><span class="workspace-icon">${icon("trophy")}</span><div>Bilik Yarışması<small>Yerli şəbəkə üzərindən</small></div><span class="workspace-dot"></span></div><span class="nav-caption">İDARƏETMƏ</span><nav>${[
    ["dashboard", "grid", "İdarəetmə paneli"],
    ["players", "users", "Oyunçular"],
  ]
    .map(
      ([id, symbol, label]) =>
        `<button class="nav-item ${page === id ? "selected" : ""}" data-page="${id}">${icon(symbol)}${label}${id === "players" ? `<span class="nav-count">${state.players.length}</span>` : ""}</button>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-bottom"><div class="network-card"><span class="network-symbol">${icon("wifi")}</span><strong>Hər şey bir şəbəkədə</strong><p>Oyunçular eyni Wi-Fi və ya LAN şəbəkəsindən qoşula bilər.</p><a href="/" target="_blank">Oyunçu səhifəsi ${icon("arrow")}</a></div><div class="admin-profile"><span class="avatar admin-avatar">A</span><div>Administrator<small>Yarışma idarəçisi</small></div><button class="icon-button" data-action="logout" aria-label="Çıxış">${icon("logout")}</button></div></div></aside>`;
}
function stats() {
  return `<div class="stats">${[
    [
      "Aktiv oyun",
      titles[state.mode],
      "İki rejim, bir yarışma",
      "bolt",
      "mint",
    ],
    [
      "Oyunçu sayı",
      `${state.players.filter((p) => p.connected).length}<span class="stat-unit"> / ${state.players.length}</span>`,
      "Onlayn / qeydiyyatdan keçən",
      "users",
      "blue",
    ],
    [
      state.mode === "xemse" ? "Cari mərhələ" : "Cari raund",
      String(state.round).padStart(2, "0"),
      state.mode === "brain"
        ? `Sual ${state.questionNumber}`
        : `Sual ${state.questionNumber} / 5 · ${state.questionPoints} xal`,
      "ring",
      "purple",
    ],
    [
      "Server vəziyyəti",
      socket.connected ? "Aktivdir" : "Oflayndır",
      "Yerli şəbəkə bağlantısı",
      "monitor",
      "orange",
    ],
  ]
    .map(
      ([label, value, sub, symbol, color]) =>
        `<article class="stat-card"><div><span class="muted">${label}</span><strong>${value}</strong><small>${sub}</small></div><span class="stat-icon ${color}">${icon(symbol)}</span></article>`,
    )
    .join("")}</div>`;
}
function modeSelector() {
  if (state.mode === "brain")
    return `<section class="panel compact-mode-panel"><h2>Oyun rejimi</h2><div>${Object.entries(
      titles,
    )
      .map(
        ([mode, title]) =>
          `<button class="compact-mode ${mode === state.mode ? "active" : ""}" data-mode="${mode}">${icon(mode === "brain" ? "ring" : "bolt")}${title}</button>`,
      )
      .join("")}</div></section>`;
  return `<section class="panel mode-panel"><div class="panel-heading"><div><h2>Oyun rejimi</h2><p>Yarışmanın ritmini seçin.</p></div><span class="subtle">Yalnız admin dəyişə bilər ${icon("shield")}</span></div><div class="mode-options">${Object.keys(
    titles,
  )
    .map(
      (mode, i) =>
        `<button class="mode-card ${state.mode === mode ? "active" : ""}" data-mode="${mode}"><div class="mode-card-top"><span class="mode-symbol">${icon(["bolt", "ring"][i])}</span><span class="radio-dot"></span></div><strong>${titles[mode]}</strong><p>${descriptions[mode]}</p><span class="mode-tag">${["Sürətli düymə", "20 saniyə · növbə · xal"][i]}</span></button>`,
    )
    .join("")}</div></section>`;
}
function controls() {
  return state.mode === "brain" ? brainControls(state) : xemseControls(state);
}
function playersPanel(full = false) {
  return `<section class="panel players-panel"><div class="panel-heading"><div><h2>Oyunçular <span class="count-chip">${state.players.length}</span></h2><p>Yarışmanın iştirakçıları</p></div><span class="online-count"><i></i>${state.players.filter((p) => p.connected).length} onlayn</span></div>${state.players.length ? `<div class="player-list ${full ? "full" : ""}">${state.players.map((p, i) => `<div class="player-row"><span class="avatar color-${i % 4}">${escape(p.name.charAt(0).toLocaleUpperCase("az"))}</span><div class="player-info"><strong>${escape(p.name)}</strong><small><i class="${p.connected ? "green" : "gray"}"></i>${p.connected ? "Onlayn" : "Oflayn"}</small></div><button class="icon-button remove" data-remove="${p.id}" aria-label="${escape(p.name)} — Sil">${icon("close")}</button></div>`).join("")}</div>` : `<div class="empty-players">${icon("users")}<h3>Oyunçuları dəvət edin</h3><p>Eyni şəbəkədə oyunçu səhifəsini açaraq yarışmaya qoşula bilərlər.</p></div>`}<div class="invite-box"><span>${icon("wifi")} Qoşulmaq üçün</span><button data-action="copy" title="Oyunçu ünvanını kopyala">${escape(
    joinUrl()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, ""),
  )} ${icon("arrow")}</button></div></section>`;
}
function renderAdmin() {
  app.innerHTML = `${sidebar()}<div class="admin-main"><header class="topbar"><div>Bilik Yarışması <span>/</span> <strong>${page === "dashboard" ? "İdarəetmə paneli" : "Oyunçular"}</strong></div><div class="topbar-actions">${soundButton()}${connection()}<button class="icon-button mobile-logout" data-action="logout" aria-label="Çıxış">${icon("logout")}</button></div></header><main class="dashboard ${state.mode === "brain" ? "brain-dashboard" : ""}"><div class="page-heading"><div><span class="eyebrow">HƏR BİLİK BİR GÜCDÜR</span><h1>${page === "dashboard" ? "Yarışmanın mərkəzi" : "Oyunçular"}<span class="heading-dot">.</span></h1><p>${page === "dashboard" ? "Oyunu idarə edin, həyəcanı paylaşın. Hər şey sizin nəzarətinizdədir." : "İştirakçıları və bağlantı vəziyyətini izləyin."}</p></div><span class="local-badge">${icon("wifi")} Yerli şəbəkə</span></div>${stats()}${page === "dashboard" ? `${modeSelector()}<div class="dashboard-columns"><div class="main-column">${controls()}${state.mode === "brain" ? brainQueue(state) + brainHistory(state) : xemseOrder(state)}</div><div class="brain-side-column">${scoreboard(state)}${playersPanel()}</div></div>` : `<div class="players-overview">${scoreboard(state)}${playersPanel(true)}</div>`}<footer>Bilik Yarışması <span>Birlikdə daha çox bilirik.</span></footer></main></div>`;
  app.querySelectorAll("[data-page]").forEach(
    (el) =>
      (el.onclick = () => {
        page = el.dataset.page;
        render();
      }),
  );
  app.querySelectorAll("[data-mode]").forEach(
    (el) =>
      (el.onclick = () => {
        if (el.dataset.mode !== state.mode)
          confirmAction(
            "Oyun rejimi dəyişsin?",
            "Aktiv sual varsa, bitiriləcək. Hər iki oyunun xalları saxlanılacaq.",
            () => admin("select", el.dataset.mode),
          );
      }),
  );
  app
    .querySelectorAll("[data-remove]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          confirmAction(
            "Oyunçu silinsin?",
            "Oyunçu yenidən qeydiyyatdan keçə bilər.",
            () => admin("remove", el.dataset.remove),
          )),
    );
  app.querySelectorAll("[data-action]").forEach(
    (el) =>
      (el.onclick = () => {
        const action = el.dataset.action;
        if (action === "logout") {
          password = null;
          authorized = false;
          sessionStorage.removeItem("bilik-admin");
          socket.disconnect();
          socket.connect();
          render();
        } else if (action === "copy") {
          const url = joinUrl();
          if (navigator.clipboard)
            navigator.clipboard
              .writeText(url)
              .then(() => toast("Ünvan kopyalandı."))
              .catch(() => toast(url));
          else toast(url);
        } else if (action === "reset") {
          const captured = context();
          confirmAction(
            "Sual sıfırlansın?",
            "Cari sualın cavabları və bu sualda verilmiş xallar ləğv ediləcək.",
            () => admin(action, undefined, captured),
          );
        } else if (action === "restart") {
          const captured = context();
          confirmAction(
            "Yenidən başlat",
            "Bütün Xəmsə xalları, mərhələlər və nəticələr sıfırlanacaq. Davam edilsin?",
            () => admin(action, undefined, captured),
          );
        } else admin(action);
      }),
  );
  bindBrainControls();
  app
    .querySelectorAll("[data-nominal]")
    .forEach(
      (el) =>
        (el.onclick = () => admin("setNominal", Number(el.dataset.nominal))),
    );
  const nominal = app.querySelector("#nominal-form");
  if (nominal)
    nominal.onsubmit = (e) => {
      e.preventDefault();
      admin("setNominal", Number(new FormData(nominal).get("nominal")));
    };
}
function context() {
  return {
    competitionId: state.competitionId,
    roundId: state.roundId,
    questionId: state.questionId,
    candidateId: state.currentCandidate?.playerId,
  };
}
async function admin(action, value, captured = context()) {
  return send("admin", { action, value, ...captured });
}
function bindBrainControls() {
  if (state.mode !== "brain") return;
  app.querySelectorAll("[data-brain-action]").forEach(
    (el) =>
      (el.onclick = () => {
        const action = el.dataset.brainAction,
          captured = context();
        if (action === "restart")
          confirmAction(
            "Yenidən başlat",
            "Bütün xallar, raundlar və nəticələr sıfırlanacaq. Davam edilsin?",
            () => admin(action, undefined, captured),
          );
        else if (action === "endQuestion")
          confirmAction(
            "Sualı bitir / keç",
            "Cari cavab və növbə bağlanacaq. Bu sual üçün əlavə xal verilməyəcək.",
            () => admin(action, undefined, captured),
          );
        else admin(action, undefined, captured);
      }),
  );
  app
    .querySelectorAll("[data-points]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          admin(
            el.dataset.pointKind === "award" ? "setAwardPoints" : "setPoints",
            Number(el.dataset.points),
          )),
    );
  app.querySelectorAll("[data-custom-points]").forEach(
    (form) =>
      (form.onsubmit = (e) => {
        e.preventDefault();
        admin(
          form.dataset.customPoints === "award"
            ? "setAwardPoints"
            : "setPoints",
          Number(new FormData(form).get("points")),
        );
      }),
  );
  const winner = app.querySelector("#winner-form");
  if (winner)
    winner.onsubmit = (e) => {
      e.preventDefault();
      const id = new FormData(winner).get("winner"),
        captured = context();
      if (id)
        confirmAction(
          "Qalib kimi təsdiqlə",
          "Seçilmiş oyunçu bu raundun qalibi kimi saxlanılacaq.",
          () => admin("winner", id, captured),
        );
    };
}
function confirmAction(title, description, callback) {
  const dialog = document.createElement("dialog");
  dialog.innerHTML = `<h2>${title}</h2><p>${description}</p><div class="dialog-buttons"><button class="button" id="cancel">Ləğv et</button><button class="button primary" id="confirm">Təsdiq et</button></div>`;
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector("#cancel").onclick = () => {
    dialog.close();
    dialog.remove();
  };
  dialog.querySelector("#confirm").onclick = () => {
    dialog.close();
    dialog.remove();
    callback();
  };
  dialog.oncancel = () => dialog.remove();
}
function renderPlayer() {
  const me = state.players.find((p) => p.id === identity.playerId),
    result = state.order.find((r) => r.playerId === identity.playerId);
  const brain = state.mode === "brain";
  const enabled =
    socket.connected &&
    !pending &&
    !result &&
    state.status === "ANSWERING_OPEN";
  const content = brain
    ? brainPlayer(state, identity.playerId, !socket.connected || pending)
    : xemsePlayer(state, identity.playerId, enabled, ordinal);
  app.innerHTML = `<div class="player-shell"><header>${brand()}<div class="player-header-actions">${soundButton()}${connection()}</div></header><main class="player-main"><div class="player-greeting"><span class="avatar mint">${escape((me?.name || identity.name).charAt(0))}</span><div>Xoş gəldiniz,<h2>${escape(me?.name || identity.name)}</h2></div><span class="round-chip">${brain ? "Raund" : "Mərhələ"} ${state.round}</span></div><section class="player-game ${brain ? "brain-player-game" : ""}"><span class="eyebrow">CANLI BİLİK YARIŞMASI</span><h1>${titles[state.mode]}</h1><span class="player-state">${brain ? brainStatuses[state.status] : state.status === "ROUND_FINISHED" ? "Sual bitdi" : statuses[state.status]}</span>${content}<p class="player-tip">${icon("shield")} Cavab sırası server tərəfindən müəyyən edilir.</p></section>${`<details class="player-score-details"><summary>Xal cədvəli</summary>${scoreboard(state)}</details>`}</main><footer>Bilik Yarışması<span>Birlikdə daha çox bilirik.</span></footer></div>`;
  const buzz = app.querySelector("#buzz");
  if (buzz)
    buzz.onclick = async () => {
      if (pending || buzz.disabled || !socket.connected) return;
      pending = true;
      const captured = context();
      render();
      await send("answer", captured);
      pending = false;
      render();
    };
}

function render() {
  // Preserve custom point input and winner selection during live updates.
  const focus = document.activeElement;
  const focusedId = focus?.id;
  const values = [...app.querySelectorAll("input,textarea,select")]
    .filter(
      (el) =>
        !["question-points", "award-points", "nominal"].includes(el.id) ||
        el === focus,
    )
    .map((el) => [el.id, el.value]);
  const selection = focus?.selectionStart;
  if ((adminRoute && !authorized) || (!adminRoute && !identity)) renderAuth();
  else if (state) {
    if (adminRoute) renderAdmin();
    else renderPlayer();
  } else
    app.innerHTML = `<div class="loading">${brand()}<p>Serverə qoşulur…</p></div>`;
  for (const [id, value] of values) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
  app.querySelectorAll("[data-sound-toggle]").forEach(
    (el) =>
      (el.onclick = () => {
        sounds.toggle();
        render();
      }),
  );
  const restored = focusedId && document.getElementById(focusedId);
  if (restored && !restored.disabled) {
    restored.focus();
    try {
      restored.setSelectionRange(selection, selection);
    } catch {}
  }
}
socket.on("connect", async () => {
  if (adminRoute && password) {
    const r = await send("login", { password });
    authorized = r.ok;
    if (!r.ok) {
      password = null;
      sessionStorage.removeItem("bilik-admin");
    }
  } else if (!adminRoute && identity) {
    const r = await send("register", identity);
    if (r.ok) {
      identity = r;
      localStorage.setItem("bilik-player", JSON.stringify(r));
    } else {
      identity = null;
      localStorage.removeItem("bilik-player");
    }
  }
  render();
});
socket.on("disconnect", () => {
  authorized = false;
  render();
});
socket.on("state", (next) => {
  state = next;
  render();
});
socket.on("sound", (event) => sounds.play(event));
socket.on("timer", (timer) => {
  if (
    state?.mode !== "brain" ||
    timer.competitionId !== state.competitionId ||
    timer.roundId !== state.roundId ||
    timer.questionId !== state.questionId
  )
    return;
  state.timer = timer;
  app
    .querySelectorAll("[data-brain-timer]")
    .forEach((el) => (el.textContent = timerText(timer.remainingMs)));
});
socket.on("removed", () => {
  identity = null;
  state = null;
  localStorage.removeItem("bilik-player");
  toast("Oyunçu silindi.");
  render();
});
render();
