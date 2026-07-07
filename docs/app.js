"use strict";
const BASE = "https://www.pokemon-card.com";
const CHUNK = 120;

let allCards = [];          // 全カード（配列）
let updatedAt = null;
let lastDiff = null;
let currentTab = "pokemon";
let renderList = [];        // フィルタ・ソート適用後
let renderedCount = 0;

// ---------- タイプバッジ ----------
const TYPE_BADGE = {
  "草": ["草", "#3f9c35", "#fff"], "炎": ["炎", "#e03a3e", "#fff"], "水": ["水", "#2492d1", "#fff"],
  "雷": ["雷", "#f5c500", "#413000"], "超": ["超", "#8e44ad", "#fff"], "闘": ["闘", "#b15a28", "#fff"],
  "悪": ["悪", "#31475e", "#fff"], "鋼": ["鋼", "#8b98a4", "#fff"], "フェアリー": ["妖", "#e86190", "#fff"],
  "ドラゴン": ["竜", "#b8973d", "#fff"], "無": ["無", "#dcdcd0", "#4c4c44"],
};

function badge(t) {
  const b = TYPE_BADGE[t];
  const s = document.createElement("span");
  s.className = "tb";
  if (b) {
    s.textContent = b[0];
    s.style.background = b[1];
    s.style.color = b[2];
    s.title = t;
  } else {
    s.textContent = t;
  }
  return s;
}

// "【草】【無】×2" のような文字列を バッジ+テキスト でDOM化
function renderTyped(container, str) {
  const parts = String(str ?? "").split(/【(.+?)】/);
  parts.forEach((p, i) => {
    if (!p) return;
    if (i % 2 === 1) container.appendChild(badge(p));
    else container.appendChild(document.createTextNode(p));
  });
}

const fmtCost = (cost) => (cost || []).map((t) => `【${t}】`).join("");
const move = (c, i) => (c.moves && c.moves[i]) || {};

// 技エネ構成（フィルタ・表示用の値）。技なし→""、エネ0の技→"（エネ0）"
function costKey(c, i) {
  const m = c.moves && c.moves[i];
  if (!m) return "";
  if (!m.cost || m.cost.length === 0) return "（エネ0）";
  return fmtCost(m.cost);
}

const stripBrackets = (s) => String(s).replace(/[【】]/g, "");

// ---------- 列定義 ----------
// type: none | text(テキスト+候補) | set(候補) | range(数値範囲)
// render: セルDOM描画（省略時はテキスト）
const typedRender = (get) => (c, td) => renderTyped(td, get(c));

const COLUMNS = {
  pokemon: [
    { key: "img", label: "画像", type: "none" },
    { key: "mark", label: "レギュ", type: "set", get: (c) => c.mark || "?", cls: "nowrap" },
    { key: "stage", label: "区分", type: "set", get: (c) => c.stage || "" },
    { key: "name", label: "ポケモン名", type: "text", get: (c) => c.name || "", cls: "nowrap" },
    { key: "type", label: "タイプ", type: "set", get: (c) => c.type || "",
      render: (c, td) => { if (c.type) td.appendChild(badge(c.type)); } },
    { key: "hp", label: "HP", type: "range", get: (c) => c.hp ?? "", cls: "num" },
    { key: "abilityName", label: "特性名", type: "text", get: (c) => (c.abilities || []).map((a) => a.name).join(" / "), cls: "nowrap" },
    { key: "abilityText", label: "特性効果", type: "text", get: (c) => (c.abilities || []).map((a) => a.text).join("\n"), cls: "clip" },
    { key: "m1cost", label: "技1エネ", type: "set", get: (c) => costKey(c, 0), cls: "nowrap",
      searchNorm: stripBrackets, render: (c, td) => renderTyped(td, costKey(c, 0)) },
    { key: "m1name", label: "技1名", type: "text", get: (c) => move(c, 0).name || "", cls: "nowrap" },
    { key: "m1dmg", label: "技1ダメージ", type: "text", get: (c) => move(c, 0).damage || "", cls: "num" },
    { key: "m1text", label: "技1効果", type: "text", get: (c) => move(c, 0).text || "", cls: "clip" },
    { key: "m2cost", label: "技2エネ", type: "set", get: (c) => costKey(c, 1), cls: "nowrap",
      searchNorm: stripBrackets, render: (c, td) => renderTyped(td, costKey(c, 1)) },
    { key: "m2name", label: "技2名", type: "text", get: (c) => move(c, 1).name || "", cls: "nowrap" },
    { key: "m2dmg", label: "技2ダメージ", type: "text", get: (c) => move(c, 1).damage || "", cls: "num" },
    { key: "m2text", label: "技2効果", type: "text", get: (c) => move(c, 1).text || "", cls: "clip" },
    { key: "weakness", label: "弱点", type: "set", get: (c) => c.weakness || "--", cls: "nowrap",
      searchNorm: stripBrackets, render: typedRender((c) => c.weakness || "--") },
    { key: "resistance", label: "抵抗力", type: "set", get: (c) => c.resistance || "--", cls: "nowrap",
      searchNorm: stripBrackets, render: typedRender((c) => c.resistance || "--") },
    { key: "retreat", label: "逃げエネ", type: "set", get: (c) => (c.retreat ?? "") === "" ? "" : String(c.retreat), cls: "num" },
    { key: "set", label: "収録", type: "set", get: (c) => c.set || "", cls: "nowrap" },
  ],
  trainer: [
    { key: "img", label: "画像", type: "none" },
    { key: "mark", label: "レギュ", type: "set", get: (c) => c.mark || "?", cls: "nowrap" },
    { key: "trainerType", label: "区分", type: "set", get: (c) => c.trainerType || "" },
    { key: "name", label: "カード名", type: "text", get: (c) => c.name || "", cls: "nowrap" },
    { key: "text", label: "効果", type: "text", get: (c) => c.text || "" },
    { key: "set", label: "収録", type: "set", get: (c) => c.set || "", cls: "nowrap" },
  ],
  energy: [
    { key: "img", label: "画像", type: "none" },
    { key: "mark", label: "レギュ", type: "set", get: (c) => c.mark || "?", cls: "nowrap" },
    { key: "name", label: "エネルギー名", type: "text", get: (c) => c.name || "", cls: "nowrap" },
    { key: "types", label: "タイプ", type: "set", get: (c) => c.types || [], fmt: (v) => fmtCost(v), cls: "nowrap",
      searchNorm: stripBrackets, render: (c, td) => (c.types || []).forEach((t) => td.appendChild(badge(t))) },
    { key: "text", label: "効果", type: "text", get: (c) => c.text || "" },
    { key: "set", label: "収録", type: "set", get: (c) => c.set || "", cls: "nowrap" },
  ],
};

// タブごとのフィルタ・ソート状態
const state = {};
for (const tab of Object.keys(COLUMNS)) {
  state[tab] = { filters: {}, sort: null, search: "" };
}

function tabCards(tab) {
  if (tab === "energy") return allCards.filter((c) => c.category === "energy" && c.energyType === "特殊エネルギー");
  return allCards.filter((c) => c.category === tab);
}

// ---------- フィルタ ----------
function matchText(value, query) {
  const hay = String(value).toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((q) => hay.includes(q));
}

function setValueKeys(col, c) {
  // set型フィルタ用のキー（配列は各要素、スカラは文字列1つ）
  const v = col.get(c);
  if (Array.isArray(v)) return v.length ? v.map(String) : ["(なし)"];
  return [v === "" ? "(なし)" : String(v)];
}

function applyFilters(tab) {
  const cols = COLUMNS[tab];
  const st = state[tab];
  let rows = tabCards(tab);

  if (st.search) {
    rows = rows.filter((c) =>
      cols.some((col) => col.get && matchText(col.fmt ? col.fmt(col.get(c)) : col.get(c), st.search)));
  }
  for (const col of cols) {
    const f = st.filters[col.key];
    if (!f || !col.get) continue;
    if (col.type === "text") {
      if (f.q) rows = rows.filter((c) => matchText(col.get(c), f.q));
      if (f.selected) rows = rows.filter((c) => {
        const v = String(col.get(c));
        return f.selected.has(v === "" ? "(なし)" : v);
      });
    } else if (col.type === "set" && f.selected) {
      rows = rows.filter((c) => setValueKeys(col, c).some((k) => f.selected.has(k)));
    } else if (col.type === "range" && (f.min != null || f.max != null)) {
      rows = rows.filter((c) => {
        const v = Number(col.get(c));
        if (Number.isNaN(v) || col.get(c) === "") return false;
        if (f.min != null && v < f.min) return false;
        if (f.max != null && v > f.max) return false;
        return true;
      });
    }
  }

  if (st.sort) {
    const col = cols.find((x) => x.key === st.sort.key);
    if (col && col.get) {
      const dir = st.sort.dir;
      rows = rows.slice().sort((a, b) => {
        let va = col.get(a), vb = col.get(b);
        if (Array.isArray(va)) va = va.join("");
        if (Array.isArray(vb)) vb = vb.join("");
        const na = Number(va), nb = Number(vb);
        const bothNum = va !== "" && vb !== "" && !Number.isNaN(na) && !Number.isNaN(nb);
        let r;
        if (bothNum) r = na - nb;
        else r = String(va).localeCompare(String(vb), "ja");
        if (va === "" && vb !== "") r = 1;       // 空値は常に後ろ
        else if (vb === "" && va !== "") r = -1;
        return dir === "asc" ? r : -r;
      });
    }
  }
  return rows;
}

function filterActive(tab, key) {
  const f = state[tab].filters[key];
  if (!f) return false;
  return !!(f.q || f.selected || f.min != null || f.max != null);
}

// ---------- テーブル描画 ----------
const gridHead = document.getElementById("gridHead");
const gridBody = document.getElementById("gridBody");
const emptyMsg = document.getElementById("emptyMsg");

function renderHead() {
  const cols = COLUMNS[currentTab];
  const st = state[currentTab];
  const tr = document.createElement("tr");
  for (const col of cols) {
    const th = document.createElement("th");
    const inner = document.createElement("div");
    inner.className = "th-inner";
    const label = document.createElement("span");
    label.className = "th-label";
    label.textContent = col.label;
    const mark = document.createElement("span");
    mark.className = "sort-mark";
    if (st.sort && st.sort.key === col.key) mark.textContent = st.sort.dir === "asc" ? "▲" : "▼";
    if (col.get) {
      label.addEventListener("click", () => {
        if (st.sort && st.sort.key === col.key) {
          st.sort = st.sort.dir === "asc" ? { key: col.key, dir: "desc" } : null;
        } else {
          st.sort = { key: col.key, dir: "asc" };
        }
        refresh();
      });
    }
    inner.appendChild(label);
    inner.appendChild(mark);
    if (col.type !== "none") {
      const btn = document.createElement("button");
      btn.className = "filter-btn" + (filterActive(currentTab, col.key) ? " active" : "");
      btn.textContent = "▼";
      btn.title = "フィルタ";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openFilterPopup(col, btn);
      });
      inner.appendChild(btn);
    }
    th.appendChild(inner);
    tr.appendChild(th);
  }
  gridHead.replaceChildren(tr);
}

function cardRow(c) {
  const cols = COLUMNS[currentTab];
  const tr = document.createElement("tr");
  for (const col of cols) {
    const td = document.createElement("td");
    if (col.key === "img") {
      const im = document.createElement("img");
      im.className = "thumb";
      im.loading = "lazy";
      im.src = BASE + (c.img || "");
      im.alt = c.name || "";
      im.title = "クリックで拡大";
      td.className = "img-cell";
      td.appendChild(im);
      td.addEventListener("click", () => showCardModal(c));
    } else if (col.render) {
      col.render(c, td);
      if (col.cls) td.className = col.cls;
    } else {
      const v = col.get(c);
      td.textContent = col.fmt ? col.fmt(v) : v;
      if (col.cls) td.className = col.cls;
    }
    tr.appendChild(td);
  }
  return tr;
}

function renderMore() {
  const frag = document.createDocumentFragment();
  const end = Math.min(renderedCount + CHUNK, renderList.length);
  for (let i = renderedCount; i < end; i++) frag.appendChild(cardRow(renderList[i]));
  renderedCount = end;
  gridBody.appendChild(frag);
}

function refresh() {
  renderHead();
  renderList = applyFilters(currentTab);
  renderedCount = 0;
  gridBody.replaceChildren();
  renderMore();
  const total = tabCards(currentTab).length;
  document.getElementById("rowCount").textContent = `${renderList.length} / ${total} 件`;
  emptyMsg.hidden = renderList.length > 0;
  emptyMsg.textContent = total === 0
    ? "データがありません。右上の「🔄 更新」でカードデータを取得してください。"
    : "条件に一致するカードがありません。";
}

// 無限スクロール
new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting) && renderedCount < renderList.length) renderMore();
}, { root: document.getElementById("tableWrap"), rootMargin: "600px" })
  .observe(document.getElementById("sentinel"));

// ---------- フィルタポップアップ ----------
const popup = document.getElementById("filterPopup");
let popupCleanup = null;

function closePopup() {
  popup.hidden = true;
  popup.replaceChildren();
  if (popupCleanup) { popupCleanup(); popupCleanup = null; }
}

// 一意な値の候補リスト（チェックボックス）を作る。set/text 共用。
function buildChecklist(col, current) {
  const counts = new Map();
  for (const c of tabCards(currentTab)) {
    for (const k of setValueKeys(col, c)) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const values = [...counts.keys()].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b), "ja");
  });

  const wrap = document.createElement("div");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "候補を検索";
  wrap.appendChild(search);

  const selRow = document.createElement("div");
  selRow.className = "select-all-row";
  const btnAll = document.createElement("button");
  btnAll.className = "link-btn"; btnAll.type = "button"; btnAll.textContent = "表示中をすべて選択";
  const btnNone = document.createElement("button");
  btnNone.className = "link-btn"; btnNone.type = "button"; btnNone.textContent = "すべて解除";
  selRow.append(btnAll, btnNone);
  wrap.appendChild(selRow);

  const list = document.createElement("div");
  list.className = "checklist";
  const boxes = [];
  const norm = col.searchNorm || ((s) => s);
  const LIMIT = 1200;
  const note = document.createElement("div");
  note.className = "note";
  wrap.appendChild(list);
  wrap.appendChild(note);

  function renderItems(q) {
    list.replaceChildren();
    boxes.length = 0;
    let shown = 0;
    for (const v of values) {
      if (q && !norm(String(v)).toLowerCase().includes(q)) continue;
      if (shown >= LIMIT) { shown++; continue; }
      const lab = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = v;
      cb.checked = current.selected ? current.selected.has(v) : true;
      lab.appendChild(cb);
      const txt = document.createElement("span");
      txt.className = "cl-text";
      if (col.render && v !== "(なし)") renderTyped(txt, v);
      else txt.textContent = v;
      lab.appendChild(txt);
      lab.append(` (${counts.get(v)})`);
      list.appendChild(lab);
      boxes.push({ cb, v });
      shown++;
    }
    note.textContent = shown > LIMIT ? `候補が多いため先頭${LIMIT}件のみ表示中。検索で絞り込んでください。` : "";
  }
  renderItems("");
  search.addEventListener("input", () => renderItems(norm(search.value).toLowerCase()));
  btnAll.addEventListener("click", () => boxes.forEach((b) => { b.cb.checked = true; }));
  btnNone.addEventListener("click", () => boxes.forEach((b) => { b.cb.checked = false; }));

  return {
    el: wrap,
    // 表示されていない候補は現状のチェック状態を維持する
    getSelected() {
      const sel = current.selected ? new Set(current.selected) : new Set(values);
      for (const b of boxes) {
        if (b.cb.checked) sel.add(b.v); else sel.delete(b.v);
      }
      return { sel, all: sel.size >= values.length && values.every((v) => sel.has(v)) };
    },
  };
}

function openFilterPopup(col, anchor) {
  closePopup();
  const st = state[currentTab];
  const f = st.filters[col.key] || {};
  popup.replaceChildren();

  const title = document.createElement("h5");
  title.textContent = `「${col.label}」のフィルタ`;
  popup.appendChild(title);

  let apply;

  if (col.type === "text") {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "含む文字列（スペース区切りでAND）";
    input.value = f.q || "";
    popup.appendChild(input);
    const checklist = buildChecklist(col, f);
    popup.appendChild(checklist.el);
    apply = () => {
      const { sel, all } = checklist.getSelected();
      const q = input.value.trim();
      if (!q && all) { delete st.filters[col.key]; return; }
      st.filters[col.key] = { q: q || undefined, selected: all ? undefined : sel };
    };
    setTimeout(() => input.focus(), 0);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { apply(); closePopup(); refresh(); }
    });
  } else if (col.type === "set") {
    const checklist = buildChecklist(col, f);
    popup.appendChild(checklist.el);
    apply = () => {
      const { sel, all } = checklist.getSelected();
      if (all) delete st.filters[col.key];
      else st.filters[col.key] = { selected: sel };
    };
  } else if (col.type === "range") {
    const row = document.createElement("div");
    row.className = "range-row";
    const min = document.createElement("input");
    min.type = "number"; min.placeholder = "最小";
    if (f.min != null) min.value = f.min;
    const max = document.createElement("input");
    max.type = "number"; max.placeholder = "最大";
    if (f.max != null) max.value = f.max;
    row.append(min, "〜", max);
    popup.appendChild(row);
    apply = () => {
      const mn = min.value === "" ? null : Number(min.value);
      const mx = max.value === "" ? null : Number(max.value);
      if (mn == null && mx == null) delete st.filters[col.key];
      else st.filters[col.key] = { min: mn, max: mx };
    };
  }

  const actions = document.createElement("div");
  actions.className = "popup-actions";
  const okBtn = document.createElement("button");
  okBtn.className = "btn primary"; okBtn.textContent = "適用";
  okBtn.addEventListener("click", () => { apply(); closePopup(); refresh(); });
  const clearBtn = document.createElement("button");
  clearBtn.className = "btn"; clearBtn.textContent = "解除";
  clearBtn.addEventListener("click", () => { delete st.filters[col.key]; closePopup(); refresh(); });
  actions.append(clearBtn, okBtn);
  popup.appendChild(actions);

  // 位置決め
  popup.hidden = false;
  const r = anchor.getBoundingClientRect();
  const pw = popup.offsetWidth;
  popup.style.top = `${r.bottom + 4}px`;
  popup.style.left = `${Math.min(r.left, window.innerWidth - pw - 12)}px`;

  const onDoc = (e) => { if (!popup.contains(e.target) && e.target !== anchor) closePopup(); };
  setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
  popupCleanup = () => document.removeEventListener("mousedown", onDoc);
}

// ---------- カード詳細モーダル ----------
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modalBody");
document.getElementById("modalClose").addEventListener("click", () => (modal.hidden = true));
modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function showCardModal(c) {
  const url = `${BASE}/card-search/details.php/card/${c.id}/regu/XY`;
  let html = `<img class="card-img" src="${BASE}${esc(c.img || "")}" alt=""><div class="card-detail">`;
  html += `<h2>${esc(c.name)}</h2>`;
  html += `<p class="meta">レギュ: ${esc(c.mark || "?")}　収録: ${esc(c.set || "-")} ${esc(c.number || "")} ${c.rarity ? "／レア度: " + esc(c.rarity) : ""}</p>`;
  if (c.category === "pokemon") {
    html += `<p>${esc(c.stage || "")}　${c.type ? "タイプ:【" + esc(c.type) + "】" : ""}　${c.hp ? "HP: " + c.hp : ""}</p>`;
    for (const a of c.abilities || []) html += `<h4>特性: ${esc(a.name)}</h4><p>${esc(a.text)}</p>`;
    for (const m of c.moves || []) {
      html += `<h4>ワザ: ${esc(fmtCost(m.cost))} ${esc(m.name)} ${esc(m.damage)}</h4>`;
      if (m.text) html += `<p>${esc(m.text)}</p>`;
    }
    html += `<p class="meta">弱点: ${esc(c.weakness || "--")}　抵抗力: ${esc(c.resistance || "--")}　にげる: ${c.retreat ?? "-"}</p>`;
  } else {
    if (c.trainerType) html += `<p class="meta">${esc(c.trainerType)}</p>`;
    if (c.energyType) html += `<p class="meta">${esc(c.energyType)} ${c.types && c.types.length ? esc(fmtCost(c.types)) : ""}</p>`;
    if (c.text) html += `<p>${esc(c.text)}</p>`;
  }
  if (c.rule) html += `<h4>ルール</h4><p>${esc(c.rule)}</p>`;
  html += `<p><a href="${url}" target="_blank" rel="noopener">公式サイトで見る ↗</a></p></div>`;
  modalBody.innerHTML = html;
  modal.hidden = false;
}

function showDiffModal() {
  if (!lastDiff) return;
  const idName = new Map(allCards.map((c) => [String(c.id), c]));
  const li = (x) => {
    const c = idName.get(String(x.id));
    return `<li>${esc(x.name || (c && c.name) || x.id)}${c && c.set ? ` <span class="tag">${esc(c.set)}</span>` : ""}</li>`;
  };
  let html = `<div class="diff-list"><h2>前回更新の差分 <span class="meta">(${esc(lastDiff.time || "")})</span></h2>`;
  html += `<h4>追加: ${lastDiff.added.length}枚</h4><ul>${lastDiff.added.map(li).join("") || "<li>なし</li>"}</ul>`;
  html += `<h4>削除: ${lastDiff.removed.length}枚</h4><ul>${lastDiff.removed.map(li).join("") || "<li>なし</li>"}</ul>`;
  if (lastDiff.errors && lastDiff.errors.length) {
    html += `<h4>取得失敗: ${lastDiff.errors.length}件</h4><ul>${lastDiff.errors.map((e) => `<li>${esc(e.id)}: ${esc(e.error)}</li>`).join("")}</ul>`;
  }
  html += `</div>`;
  modalBody.innerHTML = html;
  modal.hidden = false;
}

// ---------- データ読み込み・更新 ----------
let staticMode = false; // GitHub Pages等、更新APIのない静的ホスティングで動作中か

async function fetchCardData() {
  try {
    const res = await fetch("api/cards");
    if (res.ok && (res.headers.get("content-type") || "").includes("json")) return await res.json();
  } catch (e) { /* サーバーなし → 静的ファイルへフォールバック */ }
  staticMode = true;
  document.getElementById("updateBtn").hidden = true;
  document.getElementById("autoUpdateNote").hidden = false;
  const res = await fetch("data/cards.json");
  if (!res.ok) return { cards: {}, updated_at: null, last_diff: null };
  return await res.json();
}

async function loadCards() {
  const data = await fetchCardData();
  allCards = Object.values(data.cards || {});
  updatedAt = data.updated_at;
  lastDiff = data.last_diff;
  document.getElementById("updatedAt").textContent = updatedAt ? `最終更新: ${updatedAt}` : "未取得";
  document.getElementById("diffBtn").hidden = !lastDiff;
  document.getElementById("count-pokemon").textContent = `(${tabCards("pokemon").length})`;
  document.getElementById("count-trainer").textContent = `(${tabCards("trainer").length})`;
  document.getElementById("count-energy").textContent = `(${tabCards("energy").length})`;
  refresh();
}

const updateBtn = document.getElementById("updateBtn");
const progressArea = document.getElementById("progressArea");
const progressMsg = document.getElementById("progressMsg");
const progressFill = document.getElementById("progressFill");

async function pollStatus() {
  const res = await fetch("api/status");
  const st = await res.json();
  progressArea.hidden = false;
  progressMsg.textContent = st.message || "";
  const pct = st.total > 0 ? Math.round((st.done / st.total) * 100) : (st.phase === "list" ? 5 : 0);
  progressFill.style.width = `${st.phase === "done" ? 100 : pct}%`;
  if (st.running) {
    setTimeout(pollStatus, 1000);
  } else {
    updateBtn.disabled = false;
    updateBtn.textContent = "🔄 更新";
    await loadCards();
    if (st.error) {
      progressMsg.textContent = st.message || st.error;
    } else {
      setTimeout(() => (progressArea.hidden = true), 6000);
      if (lastDiff && (lastDiff.added.length || lastDiff.removed.length)) showDiffModal();
    }
  }
}

updateBtn.addEventListener("click", async () => {
  updateBtn.disabled = true;
  updateBtn.textContent = "更新中…";
  progressArea.hidden = false;
  progressMsg.textContent = "更新を開始しています…";
  progressFill.style.width = "0%";
  await fetch("api/update", { method: "POST" });
  pollStatus();
});

document.getElementById("diffBtn").addEventListener("click", showDiffModal);

// ---------- タブ・検索 ----------
if (COLUMNS[location.hash.slice(1)]) {
  currentTab = location.hash.slice(1);
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === currentTab));
}
for (const btn of document.querySelectorAll(".tab")) {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    location.hash = currentTab;
    document.getElementById("globalSearch").value = state[currentTab].search;
    closePopup();
    refresh();
    document.getElementById("tableWrap").scrollTop = 0;
  });
}

let searchTimer = null;
document.getElementById("globalSearch").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state[currentTab].search = e.target.value.trim();
    refresh();
  }, 250);
});

document.getElementById("clearFilters").addEventListener("click", () => {
  state[currentTab] = { filters: {}, sort: null, search: "" };
  document.getElementById("globalSearch").value = "";
  refresh();
});

window.addEventListener("resize", closePopup);
document.getElementById("tableWrap").addEventListener("scroll", () => { if (!popup.hidden) closePopup(); });

// 起動時：データ読み込み → 実行中の更新があれば進捗表示に復帰
loadCards().then(async () => {
  if (staticMode) return;
  const st = await (await fetch("api/status")).json();
  if (st.running) {
    updateBtn.disabled = true;
    updateBtn.textContent = "更新中…";
    pollStatus();
  }
});
