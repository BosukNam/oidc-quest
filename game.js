// OIDC 퀘스트 — 엔진
// 타일 16px 격자 위의 탑뷰 마을. 클릭/탭하면 BFS 로 길을 찾아 걷고, 키보드는 한 칸씩 이동.
(() => {
  "use strict";
  const T = 16, MW = 46, MH = 32;
  const G = { GRASS: 0, ROAD: 1, PLAZA: 2, ALLEY: 3, WATER: 4, TREE: 5, BUILD: 6, FOUNTAIN: 7, FLOWER: 8, LAMP: 9 };
  const SOLID = new Set([G.WATER, G.TREE, G.BUILD, G.FOUNTAIN, G.LAMP]);
  const START = { x: 21, y: 24 };
  const NPCS = window.NPCS, CHAPTERS = window.CHAPTERS, ITEMS = window.ITEMS;

  const BUILDINGS = [
    { x: 3,  y: 6, w: 8, h: 6, name: "DB 서고",      wall: "#e9efe2", roof: "#2f9e44", trim: "#1e6b2f" },
    { x: 17, y: 5, w: 8, h: 6, name: "백엔드 관제실", wall: "#dfe6ee", roof: "#2b6cb0", trim: "#1c4a7a" },
    { x: 29, y: 6, w: 7, h: 5, name: "레디스 금고",   wall: "#f3e4e4", roof: "#c92a2a", trim: "#8a1c1c" },
    { x: 37, y: 2, w: 5, h: 8, name: "SSO 탑",       wall: "#e5dbff", roof: "#5f3dc4", trim: "#3b2491", tower: true },
  ];
  const AREA_LABELS = [
    { x: 21, y: 17.2, text: "브라우저 광장" },
    { x: 39, y: 21.3, text: "말로리의 골목" },
  ];

  // ------------------------------------------------------------------ 지도 만들기
  const grid = new Uint8Array(MW * MH);
  const at = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? G.TREE : grid[y * MW + x];
  const put = (x, y, v) => { if (x >= 0 && y >= 0 && x < MW && y < MH) grid[y * MW + x] = v; };
  const rect = (x, y, w, h, v) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(i, j, v); };
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function buildMap() {
    grid.fill(G.GRASS);
    // 연못
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const dx = (x - 8) / 4.6, dy = (y - 22.5) / 3.2;
      if (dx * dx + dy * dy < 1) put(x, y, G.WATER);
    }
    rect(15, 17, 13, 10, G.PLAZA);           // 광장
    rect(33, 21, 12, 9, G.ALLEY);            // 골목
    rect(3, 13, 42, 2, G.ROAD);              // 큰길
    rect(21, 11, 1, 6, G.ROAD);              // 관제실 → 광장
    rect(7, 12, 1, 1, G.ROAD);
    rect(32, 11, 1, 2, G.ROAD);
    rect(39, 10, 1, 3, G.ROAD);
    rect(35, 11, 1, 2, G.ROAD);
    rect(38, 15, 1, 6, G.ROAD);              // 큰길 → 골목
    rect(13, 15, 1, 6, G.ROAD); rect(13, 20, 2, 1, G.ROAD);   // 연못가 오솔길
    rect(19, 19, 3, 3, G.FOUNTAIN);
    for (const b of BUILDINGS) rect(b.x, b.y, b.w, b.h, G.BUILD);
    put(34, 22, G.LAMP); put(43, 28, G.LAMP); put(36, 28, G.LAMP);

    const rnd = mulberry32(20261009);
    const nearKeep = (x, y) => {
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const v = at(x + i, y + j);
        if (v === G.ROAD || v === G.PLAZA || v === G.ALLEY || v === G.BUILD) return true;
      }
      for (const n of Object.values(NPCS)) if (Math.abs(n.x - x) + Math.abs(n.y - y) <= 2) return true;
      return Math.abs(START.x - x) + Math.abs(START.y - y) <= 2;
    };
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (at(x, y) !== G.GRASS) continue;
      const edge = x === 0 || y === 0 || x === MW - 1 || y === MH - 1;
      const edge2 = x === 1 || y === 1 || x === MW - 2 || y === MH - 2;
      if (edge || (edge2 && rnd() < 0.55)) { put(x, y, G.TREE); continue; }
      if (!nearKeep(x, y) && rnd() < 0.085) put(x, y, G.TREE);
      else if (rnd() < 0.06) put(x, y, G.FLOWER);
    }
  }
  buildMap();

  const npcAt = (x, y) => Object.entries(NPCS).find(([, n]) => n.x === x && n.y === y)?.[0] || null;
  const walkable = (x, y) => !SOLID.has(at(x, y)) && !npcAt(x, y);

  // BFS: from → 목표 칸 집합. 가장 가까운 목표까지의 경로(시작 칸 제외)를 돌려준다
  function findPath(sx, sy, goals) {
    const key = (x, y) => y * MW + x;
    const goalSet = new Set(goals.map(([x, y]) => key(x, y)));
    if (goalSet.has(key(sx, sy))) return [];
    const prev = new Int32Array(MW * MH).fill(-2);
    prev[key(sx, sy)] = -1;
    const q = [[sx, sy]];
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || prev[k] !== -2 || !walkable(nx, ny)) continue;
        prev[k] = key(x, y);
        if (goalSet.has(k)) {
          const path = []; let c = k;
          while (c !== key(sx, sy)) { path.push([c % MW, (c / MW) | 0]); c = prev[c]; }
          return path.reverse();
        }
        q.push([nx, ny]);
      }
    }
    return null;
  }
  const neighbors = (x, y) => [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]].filter(([a, b]) => walkable(a, b));
  // 모든 NPC 에 걸어서 닿을 수 있는지 시작 시 점검
  for (const [id, n] of Object.entries(NPCS)) if (!findPath(START.x, START.y, neighbors(n.x, n.y))) console.warn("닿을 수 없는 NPC:", id);

  // ------------------------------------------------------------------ 지도 미리 그리기
  const mapCanvas = document.createElement("canvas");
  mapCanvas.width = MW * T; mapCanvas.height = MH * T;
  function prerender() {
    const c = mapCanvas.getContext("2d");
    const rnd = mulberry32(42);
    const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const v = at(x, y), X = x * T, Y = y * T;
      const base = (v === G.ALLEY || v === G.LAMP) ? "alley" : (v === G.PLAZA || v === G.FOUNTAIN) ? "plaza" : v === G.ROAD ? "road" : v === G.WATER ? "water" : "grass";
      if (base === "grass") {
        px(X, Y, T, T, (x + y) % 2 ? "#62a85b" : "#5ea257");
        for (let i = 0; i < 3; i++) px(X + ((rnd() * 15) | 0), Y + ((rnd() * 15) | 0), 1, 2, "#4f8f49");
      } else if (base === "road") {
        px(X, Y, T, T, "#dcc48f");
        for (let i = 0; i < 3; i++) px(X + ((rnd() * 15) | 0), Y + ((rnd() * 15) | 0), 2, 1, "#c4ab76");
        const g = (a, b) => { const t = at(a, b); return t === G.GRASS || t === G.TREE || t === G.FLOWER; };
        if (g(x, y - 1)) px(X, Y, T, 1, "#b49a63");
        if (g(x, y + 1)) px(X, Y + T - 1, T, 1, "#b49a63");
        if (g(x - 1, y)) px(X, Y, 1, T, "#b49a63");
        if (g(x + 1, y)) px(X + T - 1, Y, 1, T, "#b49a63");
      } else if (base === "plaza") {
        px(X, Y, T, T, "#cfc8b8");
        px(X, Y, T, 1, "#b9b2a1"); px(X, Y, 1, T, "#b9b2a1");
        if ((x + y) % 3 === 0) px(X + 5, Y + 5, 6, 6, "#c6bfae");
      } else if (base === "alley") {
        px(X, Y, T, T, (x + y) % 2 ? "#3d4150" : "#393d4b");
        px(X + 1, Y + 1, 6, 6, "#454a5b"); px(X + 9, Y + 9, 6, 6, "#434858");
      } else if (base === "water") {
        px(X, Y, T, T, "#3f8fd6");
        px(X + ((rnd() * 8) | 0), Y + 4 + ((rnd() * 8) | 0), 5, 1, "#7fc0f2");
      }
      if (v === G.FLOWER) { const cols = ["#ffe066", "#ff8fab", "#ffffff"]; for (let i = 0; i < 3; i++) { const fx = X + 2 + ((rnd() * 11) | 0), fy = Y + 2 + ((rnd() * 11) | 0); px(fx, fy, 2, 2, cols[i % 3]); } }
      if (v === G.TREE) {
        px(X + 6, Y + 10, 4, 6, "#7a4e2b");
        c.fillStyle = "#2f7a3a"; c.beginPath(); c.arc(X + 8, Y + 7, 7, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#3e9449"; c.beginPath(); c.arc(X + 6, Y + 5, 4, 0, Math.PI * 2); c.fill();
      }
      if (v === G.LAMP) { px(X + 7, Y + 4, 2, 12, "#22252e"); px(X + 5, Y + 1, 6, 4, "#22252e"); px(X + 6, Y + 2, 4, 2, "#ffe8a3"); }
    }
    // 분수
    const fx = 19 * T, fy = 19 * T;
    c.fillStyle = "#9aa3ad"; c.beginPath(); c.arc(fx + 24, fy + 24, 22, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#58a6e8"; c.beginPath(); c.arc(fx + 24, fy + 24, 18, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#9aa3ad"; c.beginPath(); c.arc(fx + 24, fy + 24, 5, 0, Math.PI * 2); c.fill();
    // 건물
    for (const b of BUILDINGS) {
      const X = b.x * T, Y = b.y * T, W = b.w * T, H = b.h * T;
      const roofH = b.tower ? Math.round(H * 0.32) : Math.round(H * 0.45);
      px(X, Y + roofH, W, H - roofH, b.wall);
      px(X, Y + H - 3, W, 3, "rgba(0,0,0,.18)");
      for (let i = 0; i < roofH; i += 4) px(X - 2, Y + i, W + 4, 4, i % 8 ? b.roof : shade(b.roof, -18));
      px(X - 2, Y + roofH - 2, W + 4, 2, b.trim);
      // 창문
      const wy = Y + roofH + 6;
      for (let wx = X + 8; wx < X + W - 12; wx += 20) {
        if (Math.abs(wx + 6 - (X + W / 2)) < 12) continue;
        px(wx, wy, 12, 10, b.trim); px(wx + 1, wy + 1, 10, 8, "#bfe3ff"); px(wx + 6, wy + 1, 1, 8, b.trim);
      }
      if (b.tower) for (let ty = wy + 22; ty < Y + H - 24; ty += 20) { px(X + W / 2 - 5, ty, 10, 12, b.trim); px(X + W / 2 - 4, ty + 1, 8, 10, "#ffe8a3"); }
      // 문
      const dx = X + W / 2 - 7, dy = Y + H - 20;
      px(dx, dy, 14, 20, b.trim); px(dx + 2, dy + 2, 10, 18, shade(b.roof, -30)); px(dx + 9, dy + 10, 2, 2, "#ffd43b");
    }
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, v + amt));
    return "#" + ((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0");
  }
  prerender();

  // ------------------------------------------------------------------ 상태
  const $ = (id) => document.getElementById(id);
  const canvas = $("world"), ctx = canvas.getContext("2d");
  const store = {
    load() { try { return JSON.parse(localStorage.getItem("oidcQuest.v1") || "null"); } catch { return null; } },
    save(s) { try { localStorage.setItem("oidcQuest.v1", JSON.stringify(s)); } catch {} },
  };
  const saved = store.load();
  const state = {
    cleared: saved?.cleared || [],
    ch: saved?.ch ?? 0, step: saved?.step ?? 0,
    items: saved?.items || [], hearts: saved?.hearts ?? 5,
    started: false,
  };
  const player = { x: saved?.px ?? START.x, y: saved?.py ?? START.y, fx: 0, fy: 0, dir: "down", path: [], moving: null, phase: 0, pendingTalk: null };
  if (!walkable(player.x, player.y)) { player.x = START.x; player.y = START.y; }
  player.fx = player.x * T; player.fy = player.y * T;
  let busy = false;            // 대화나 오버레이가 떠 있는 동안 true
  let clickMark = null;        // { x, y, t }
  const held = new Set();

  function persist() {
    store.save({ cleared: state.cleared, ch: state.ch, step: state.step, items: state.items, hearts: state.hearts, px: player.x, py: player.y });
  }

  // ------------------------------------------------------------------ HUD
  const chapter = () => CHAPTERS[state.ch];
  const curStep = () => chapter().steps[state.step];
  function goalText() {
    if (state.step === 0) return chapter().start;
    return chapter().steps[state.step - 1].goal || "장 완료";
  }
  function renderHud() {
    $("chTitle").textContent = chapter().title;
    $("goal").textContent = goalText();
    $("hearts").innerHTML = "보안 신뢰도 " + Array.from({ length: 5 }, (_, i) => `<span class="${i < state.hearts ? "" : "lost"}">♥</span>`).join("");
    $("inv").innerHTML = state.items.map(id => `<span class="chip" title="${ITEMS[id].desc}"><i style="background:${ITEMS[id].color}"></i>${ITEMS[id].label}</span>`).join("");
  }
  let toastTimer = 0;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
  }

  // ------------------------------------------------------------------ 대화
  const dlg = $("dialog"), dlgText = $("dlgText"), dlgWho = $("dlgWho"), dlgChoices = $("dlgChoices"), dlgMore = $("dlgMore");
  let advance = null, typing = null;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function say(who, text, cls = "") {
    return new Promise((resolve) => {
      dlg.hidden = false; dlgChoices.innerHTML = ""; dlgMore.hidden = true;
      dlgWho.textContent = who; dlgWho.className = "who " + (cls || (who === "나" ? "me" : ""));
      let i = 0; dlgText.textContent = "";
      const finishTyping = () => { clearInterval(typing); typing = null; dlgText.textContent = text; dlgMore.hidden = false; };
      if (reduceMotion) finishTyping();
      else typing = setInterval(() => { i += 2; dlgText.textContent = text.slice(0, i); if (i >= text.length) finishTyping(); }, 18);
      advance = () => { if (typing) { finishTyping(); return; } advance = null; resolve(); };
    });
  }
  function ask(q, opts) {
    return new Promise((resolve) => {
      dlg.hidden = false; dlgMore.hidden = true; advance = null;
      dlgWho.textContent = "선택"; dlgWho.className = "who";
      dlgText.textContent = q;
      const shuffled = opts.map(o => ({ o, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.o);
      dlgChoices.innerHTML = "";
      shuffled.forEach((o, i) => {
        const b = document.createElement("button"); b.type = "button";
        b.innerHTML = `<kbd>${i + 1}</kbd><span></span>`; b.lastChild.textContent = o.t;
        b.addEventListener("click", (e) => { e.stopPropagation(); choicePick = null; resolve(o); });
        dlgChoices.appendChild(b);
      });
      choicePick = (n) => { if (shuffled[n]) { choicePick = null; resolve(shuffled[n]); } };
      dlgChoices.firstChild?.focus({ preventScroll: true });
    });
  }
  let choicePick = null;
  function closeDialog() { dlg.hidden = true; advance = null; choicePick = null; }
  dlg.addEventListener("click", () => advance && advance());

  function setItems(take = [], give = []) {
    state.items = state.items.filter(i => !take.includes(i));
    for (const g of give) if (!state.items.includes(g)) state.items.push(g);
    if (give.length) toast("획득: " + give.map(g => ITEMS[g].label).join(", "));
    renderHud();
  }

  async function loseHeart() {
    state.hearts = Math.max(0, state.hearts - 1);
    renderHud(); persist();
    if (state.hearts === 0) {
      closeDialog();
      showCard(`<h2>보안 사고 발생</h2><p>신뢰도가 바닥났습니다. 이 장을 처음부터 다시 해 봅시다. 해설을 떠올리면 금방입니다.</p>
        <div class="row-btns"><button class="btn primary" id="retryBtn" type="button">이 장 다시 하기</button></div>`);
      $("retryBtn").onclick = () => { hideCard(); startChapter(state.ch); };
      return false;
    }
    return true;
  }

  async function talk(id) {
    if (busy) return;
    const n = NPCS[id]; if (!n) return;
    busy = true;
    faceToward(n);
    const step = curStep();
    try {
      if (step && step.at === id) await runStep(step);
      else if (step && step.trap && step.trap.at === id) {
        for (const [w, t] of step.trap.lines) await say(w, t);
        await say("해설", "공격자가 올린 키로 검증했습니다. 신뢰도 -1", "bad");
        await loseHeart();
      } else {
        await say(n.name, n.idle);
        if (step) await say("목표", goalText(), "me");
      }
    } finally {
      if (state.hearts > 0 && $("overlay").hidden) { closeDialog(); busy = false; }
    }
  }

  async function runStep(step) {
    for (const [w, t] of step.lines) await say(w, t);
    if (step.choice) {
      for (;;) {
        const pick = await ask(step.choice.q, step.choice.opts);
        if (pick.ok) { await say("정답", pick.fb, "ok"); break; }
        await say("해설", pick.fb + "  (신뢰도 -1)", "bad");
        if (!(await loseHeart())) return;
      }
    }
    for (const [w, t] of step.after || []) await say(w, t);
    setItems(step.take, step.give);
    state.step++;
    renderHud(); persist();
    if (state.step >= chapter().steps.length) chapterClear();
  }

  function chapterClear() {
    const ch = chapter();
    if (!state.cleared.includes(ch.id)) state.cleared.push(ch.id);
    persist();
    closeDialog();
    const next = state.ch + 1 < CHAPTERS.length ? state.ch + 1 : null;
    showCard(`<h2>${ch.title} 완료</h2><p class="sub">면접에서 이렇게 말할 수 있으면 됩니다.</p>
      <ul>${ch.takeaways.map(t => `<li>${t}</li>`).join("")}</ul>
      <div class="row-btns">${next !== null ? `<button class="btn primary" id="nextCh" type="button">${CHAPTERS[next].title}</button>` : `<button class="btn primary" id="endBtn" type="button">엔딩 보기</button>`}
      <button class="btn" id="toMenu" type="button">장 선택</button></div>`);
    if (next !== null) $("nextCh").onclick = () => { hideCard(); startChapter(next); };
    else $("endBtn").onclick = showEnding;
    $("toMenu").onclick = showMenu;
  }

  function showEnding() {
    showCard(`<h2>당직 끝</h2><p>로그인 흐름, 공격 네 가지, 키 교체, 인증과 인가까지 모두 지나왔습니다. 마을은 오늘도 평화롭습니다.</p>
      <p class="sub">한 문장 요약: OIDC 는 SSO 가 서명한 ID 토큰으로 '누구인가'를 알려 주고, 우리는 state·nonce·PKCE·서명·클레임으로 그 증명을 검증한 뒤, '무엇을 할 수 있나'는 우리 DB 로 정한다.</p>
      <div class="row-btns"><button class="btn primary" id="toMenu2" type="button">장 선택</button></div>`);
    $("toMenu2").onclick = showMenu;
  }

  function startChapter(i) {
    state.ch = i; state.step = 0; state.items = []; state.hearts = 5;
    renderHud(); persist();
    busy = true;
    showCard(`<h2>${CHAPTERS[i].title}</h2><p>${CHAPTERS[i].intro}</p><p class="sub">목표: ${CHAPTERS[i].start}</p>
      <div class="row-btns"><button class="btn primary" id="goBtn" type="button">출발</button></div>`);
    $("goBtn").onclick = hideCard;
  }

  // ------------------------------------------------------------------ 오버레이
  function showCard(html) { busy = true; $("card").innerHTML = html; $("overlay").hidden = false; $("card").querySelector("button")?.focus({ preventScroll: true }); }
  function hideCard() { $("overlay").hidden = true; busy = false; closeDialog(); }

  function showMenu() {
    const list = CHAPTERS.map((c, i) => `<button type="button" data-i="${i}"><span class="num">${i + 1}</span><span><b>${c.title.replace(/^\d+장\.\s*/, "")}</b><small>${c.intro}</small></span><span class="mark">${state.cleared.includes(c.id) ? "완료" : (i === state.ch && state.step > 0 ? "진행 중" : "")}</span></button>`).join("");
    showCard(`<h1>OIDC 퀘스트</h1>
      <p class="sub">당신은 사내 포털의 백엔드 개발자입니다. 마을을 돌아다니며 브라우저, 레디스, DB, SSO 를 잇고, 말로리의 공격을 막아 내세요.</p>
      <div class="chapters">${list}</div>
      <div class="row-btns">${state.started && state.step > 0 ? `<button class="btn primary" id="resume" type="button">이어서 하기</button>` : ""}<button class="btn" id="howBtn" type="button">조작법</button></div>
      <p class="foot">진행 상황은 이 브라우저에만 저장됩니다.</p>`);
    $("card").querySelectorAll(".chapters button").forEach(b => b.onclick = () => { state.started = true; startChapter(+b.dataset.i); });
    $("resume")?.addEventListener("click", hideCard);
    $("howBtn").onclick = showHelp;
  }
  function showHelp() {
    showCard(`<h2>조작법</h2>
      <div class="keys">
        <kbd>클릭 · 탭</kbd><span>그 자리로 걸어갑니다. 사람이나 게시판을 누르면 다가가서 말을 겁니다</span>
        <kbd>방향키 · WASD</kbd><span>한 칸씩 이동</span>
        <kbd>Space · Enter</kbd><span>옆에 있는 대상과 대화, 대사 넘기기</span>
        <kbd>1 ~ 4</kbd><span>선택지 고르기</span>
        <kbd>노란 !</kbd><span>지금 찾아가야 할 대상. 화면 밖이면 가장자리 화살표가 방향을 알려 줍니다</span>
      </div>
      <p class="sub">틀린 선택을 하면 보안 신뢰도가 줄고 해설이 나옵니다. 다섯 번 틀리면 그 장을 다시 합니다.</p>
      <div class="row-btns"><button class="btn primary" id="okHelp" type="button">닫기</button><button class="btn" id="helpMenu" type="button">장 선택</button></div>`);
    $("okHelp").onclick = () => { if (!state.started) showMenu(); else hideCard(); };
    $("helpMenu").onclick = showMenu;
  }
  $("menuBtn").onclick = () => { if (!dlg.hidden) return; showMenu(); };
  $("helpBtn").onclick = () => { if (!dlg.hidden) return; showHelp(); };

  // ------------------------------------------------------------------ 이동
  function faceToward(n) {
    const dx = n.x - player.x, dy = n.y - player.y;
    player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  }
  function adjacentNpc() {
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.dir];
    return npcAt(player.x + d[0], player.y + d[1]) || [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([a, b]) => npcAt(player.x + a, player.y + b)).find(Boolean) || null;
  }
  function goTo(tx, ty) {
    const id = npcAt(tx, ty);
    if (id) {
      const n = NPCS[id];
      if (Math.abs(n.x - player.x) + Math.abs(n.y - player.y) === 1 && !player.moving) { talk(id); return; }
      const path = findPath(player.x, player.y, neighbors(n.x, n.y));
      if (path) { player.path = path; player.pendingTalk = id; clickMark = { x: n.x, y: n.y, t: 0 }; }
      return;
    }
    if (!walkable(tx, ty)) return;
    const path = findPath(player.x, player.y, [[tx, ty]]);
    if (path) { player.path = path; player.pendingTalk = null; clickMark = { x: tx, y: ty, t: 0 }; }
  }
  const SPEED = 5.5 * T;   // px/s
  function updatePlayer(dt) {
    if (!player.moving) {
      let next = null;
      if (player.path.length) next = player.path.shift();
      else if (!busy) {
        const k = [...held].pop();
        const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[k];
        if (d) { player.dir = k; if (walkable(player.x + d[0], player.y + d[1])) next = [player.x + d[0], player.y + d[1]]; }
      }
      if (next) {
        const [nx, ny] = next;
        if (!walkable(nx, ny)) { player.path = []; return; }
        player.dir = nx > player.x ? "right" : nx < player.x ? "left" : ny > player.y ? "down" : "up";
        player.moving = { x: nx, y: ny };
      } else if (player.pendingTalk) {
        const id = player.pendingTalk; player.pendingTalk = null; clickMark = null; talk(id);
      }
    }
    if (player.moving) {
      const tx = player.moving.x * T, ty = player.moving.y * T;
      const dx = tx - player.fx, dy = ty - player.fy, dist = Math.hypot(dx, dy), stepLen = SPEED * dt;
      player.phase += dt * 9;
      if (dist <= stepLen) {
        player.fx = tx; player.fy = ty; player.x = player.moving.x; player.y = player.moving.y; player.moving = null;
        if (!player.path.length && !player.pendingTalk) { clickMark = null; persist(); }
      } else { player.fx += dx / dist * stepLen; player.fy += dy / dist * stepLen; }
    }
  }

  // ------------------------------------------------------------------ 입력
  const KEYMAP = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
  addEventListener("keydown", (e) => {
    if (choicePick && /^Digit[1-4]$/.test(e.code)) { choicePick(+e.code.slice(5) - 1); e.preventDefault(); return; }
    if (e.code === "Space" || e.code === "Enter") {
      if (advance) { advance(); e.preventDefault(); return; }
      if (!busy && document.activeElement?.tagName !== "BUTTON") { const id = adjacentNpc(); if (id) talk(id); e.preventDefault(); }
      return;
    }
    const k = KEYMAP[e.code];
    if (k) { held.delete(k); held.add(k); player.path = []; player.pendingTalk = null; e.preventDefault(); }
  });
  addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (k) held.delete(k); });
  addEventListener("blur", () => held.clear());

  let view = { scale: 3, camX: 0, camY: 0, w: 0, h: 0, dpr: 1 };
  canvas.addEventListener("pointerdown", (e) => {
    if (busy) { if (advance) advance(); return; }
    const wx = e.clientX / view.scale + view.camX, wy = e.clientY / view.scale + view.camY;
    goTo(Math.floor(wx / T), Math.floor(wy / T));
  });

  // ------------------------------------------------------------------ 그리기
  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 3);
    view.w = innerWidth; view.h = innerHeight;
    canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
    view.scale = Math.max(2, Math.min(4, Math.floor(Math.min(view.w / (T * 26), view.h / (T * 15)))));
  }
  addEventListener("resize", resize); resize();

  function drawPerson(x, y, body, hair, dir, phase, moving) {
    const p = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + a, y + b, w, h); };
    const bob = moving ? (Math.sin(phase) > 0 ? -1 : 0) : 0;
    p(3, 14, 10, 2, "rgba(0,0,0,.22)");                              // 그림자
    const legA = moving && Math.sin(phase) > 0, legB = moving && !legA;
    p(5, 12 + (legA ? -1 : 0), 2, 3, "#2b2f45"); p(9, 12 + (legB ? -1 : 0), 2, 3, "#2b2f45");
    p(4, 7 + bob, 8, 6, body); p(4, 12 + bob, 8, 1, shade(body, -40));
    p(3, 8 + bob, 1, 4, body); p(12, 8 + bob, 1, 4, body);           // 팔
    p(4, 1 + bob, 8, 7, "#f5c9a0");                                  // 얼굴
    p(4, 0 + bob, 8, 3, hair); p(3, 1 + bob, 1, 4, hair); p(12, 1 + bob, 1, 4, hair);
    if (dir === "up") p(4, 1 + bob, 8, 6, hair);
    else {
      const ex = dir === "left" ? -1 : dir === "right" ? 1 : 0;
      p(6 + ex, 4 + bob, 1, 2, "#222"); p(9 + ex, 4 + bob, 1, 2, "#222");
    }
  }
  function drawNpc(id, n, t) {
    const x = n.x * T, y = n.y * T;
    const p = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + a, y + b, w, h); };
    if (n.kind === "person") {
      const dx = player.x - n.x, dy = player.y - n.y;
      const near = Math.abs(dx) + Math.abs(dy) <= 3;
      const dir = near ? (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up")) : "down";
      drawPerson(x, y + (Math.sin(t * 2 + n.x) > 0.6 ? -1 : 0), n.color, n.hair, dir, 0, false);
    } else if (n.kind === "terminal") {
      p(2, 14, 12, 2, "rgba(0,0,0,.25)");
      p(1, 2, 14, 10, "#2b2f45"); p(2, 3, 12, 8, "#0b1a2a");
      const blink = Math.floor(t * 2) % 2;
      p(3, 4, 7, 1, "#69db7c"); p(3, 6, 9, 1, "#69db7c"); p(3, 8, 4, 1, blink ? "#69db7c" : "#0b1a2a");
      p(6, 12, 4, 2, "#2b2f45"); p(4, 14, 8, 1, "#2b2f45");
    } else if (n.kind === "board") {
      p(2, 14, 12, 2, "rgba(0,0,0,.25)");
      p(3, 9, 2, 6, "#6b4423"); p(11, 9, 2, 6, "#6b4423");
      p(0, 1, 16, 10, "#8a5a2b"); p(1, 2, 14, 8, n.color === "#495057" ? "#3a3f47" : "#f8f3e6");
      const ink = n.color === "#495057" ? "#ff6b6b" : n.color;
      p(2, 3, 5, 3, ink); p(8, 3, 5, 3, ink); p(2, 7, 11, 1, "#999");
    } else if (n.kind === "hood") {
      p(3, 14, 10, 2, "rgba(0,0,0,.3)");
      const sway = Math.sin(t * 1.5) > 0 ? 0 : 1;
      p(3, 2, 10, 13, "#2d1b3d"); p(4, 1, 8, 3, "#2d1b3d"); p(2, 6 + sway, 1, 7, "#2d1b3d"); p(13, 6, 1, 7, "#2d1b3d");
      p(5, 4, 6, 5, "#120a18"); p(6, 6, 1, 1, "#ff4d6d"); p(9, 6, 1, 1, "#ff4d6d");
    }
  }

  function drawLabel(text, wx, wy, opts = {}) {
    const sx = (wx - view.camX) * view.scale, sy = (wy - view.camY) * view.scale;
    if (sx < -200 || sy < -40 || sx > view.w + 200 || sy > view.h + 40) return;
    ctx.font = `${opts.size || 13}px "Do Hyeon", "Apple SD Gothic Neo", sans-serif`;
    const w = ctx.measureText(text).width + 10, h = (opts.size || 13) + 7;
    ctx.fillStyle = opts.bg || "rgba(20,26,46,.82)";
    ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - h), Math.round(w), h);
    ctx.fillStyle = opts.color || "#f1f3ff";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, sx, sy - h / 2 + 1);
  }

  function targetId() {
    const s = curStep();
    return (state.started && s) ? s.at : null;
  }

  let elapsed = 0;
  function draw() {
    const { dpr, scale } = view;
    // 카메라
    const vw = view.w / scale, vh = view.h / scale;
    let cx = player.fx + T / 2 - vw / 2, cy = player.fy + T / 2 - vh / 2;
    cx = vw >= MW * T ? (MW * T - vw) / 2 : Math.max(0, Math.min(MW * T - vw, cx));
    cy = vh >= MH * T ? (MH * T - vh) / 2 : Math.max(0, Math.min(MH * T - vh, cy));
    view.camX = Math.round(cx * scale) / scale; view.camY = Math.round(cy * scale) / scale;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#1b2a1d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -view.camX * dpr * scale, -view.camY * dpr * scale);
    ctx.drawImage(mapCanvas, 0, 0);

    // 분수 물결
    const fr = 6 + (Math.sin(elapsed * 2) + 1) * 4;
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(19 * T + 24, 19 * T + 24, fr, 0, Math.PI * 2); ctx.stroke();
    // 골목 가로등 불빛
    ctx.fillStyle = `rgba(255, 232, 163, ${0.10 + 0.04 * Math.sin(elapsed * 7)})`;
    for (const [lx, ly] of [[34, 22], [43, 28], [36, 28]]) { ctx.beginPath(); ctx.arc(lx * T + 8, ly * T + 10, 22, 0, Math.PI * 2); ctx.fill(); }

    // 클릭 지점
    if (clickMark) {
      clickMark.t += 1 / 60;
      const r = 3 + (clickMark.t * 10) % 5;
      ctx.strokeStyle = "rgba(255,212,59,.9)";
      ctx.strokeRect(clickMark.x * T + 8 - r, clickMark.y * T + 8 - r, r * 2, r * 2);
    }

    // 엔티티: y 순서로
    const ents = Object.entries(NPCS).map(([id, n]) => ({ y: n.y * T, draw: () => drawNpc(id, n, elapsed) }));
    ents.push({ y: player.fy + 0.5, draw: () => drawPerson(Math.round(player.fx), Math.round(player.fy), "#1098ad", "#2b1d14", player.dir, player.phase, !!player.moving) });
    ents.sort((a, b) => a.y - b.y).forEach(e => e.draw());

    // 목표 표시
    const tid = targetId();
    if (tid) {
      const n = NPCS[tid];
      const by = n.y * T - 9 + Math.sin(elapsed * 5) * 2;
      ctx.fillStyle = "#1b1f3b"; ctx.fillRect(n.x * T + 5, by - 1, 6, 10);
      ctx.fillStyle = "#ffd43b"; ctx.fillRect(n.x * T + 6, by, 4, 5); ctx.fillRect(n.x * T + 6, by + 6, 4, 2);
    }

    // 화면 좌표 오버레이
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    for (const b of BUILDINGS) drawLabel(b.name, (b.x + b.w / 2) * T, b.y * T + 2, { size: 15, color: "#ffd43b" });
    for (const a of AREA_LABELS) drawLabel(a.text, a.x * T, a.y * T, { size: 14, color: "#ffd43b", bg: "rgba(20,26,46,.6)" });
    for (const [id, n] of Object.entries(NPCS)) drawLabel(n.name, n.x * T + 8, n.y * T - (id === tid ? 11 : 1), { size: 12, color: id === tid ? "#ffd43b" : "#f1f3ff" });

    // 화면 밖 목표 화살표
    if (tid) {
      const n = NPCS[tid];
      const sx = (n.x * T + 8 - view.camX) * scale, sy = (n.y * T + 8 - view.camY) * scale;
      const m = 34, top = 110;
      if (sx < 0 || sy < top - 40 || sx > view.w || sy > view.h - 60) {
        const cxs = view.w / 2, cys = view.h / 2;
        const ang = Math.atan2(sy - cys, sx - cxs);
        const ex = Math.max(m, Math.min(view.w - m, sx)), ey = Math.max(top, Math.min(view.h - m - 40, sy));
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
        ctx.fillStyle = "#ffd43b"; ctx.strokeStyle = "#1b1f3b"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.stroke(); ctx.fill();
        ctx.restore();
      }
    }
  }

  // 고정 60Hz 업데이트, 화면 주사율과 무관하게 같은 속도
  let last = performance.now(), acc = 0;
  const STEP = 1 / 60;
  function frame(now) {
    acc += Math.min(1, (now - last) / 1000); last = now;
    while (acc >= STEP) { updatePlayer(STEP); elapsed += STEP; acc -= STEP; }
    draw();
    requestAnimationFrame(frame);
  }

  renderHud();
  state.started = !!saved;
  showMenu();
  requestAnimationFrame(frame);
  window.__quest = { state, player, goTo, talk, NPCS, findPath, neighbors };   // 디버그용
})();
