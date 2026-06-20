"use strict";

const state = {
  data: null,
  byId: new Map(),
  timer: null,
};

const $ = (sel) => document.querySelector(sel);

// ---------- 數字格式 ----------
function fmt(n, max = 2) {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 100) return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (abs >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: max });
  // 小數：保留有效位數
  return n.toLocaleString("en-US", { maximumSignificantDigits: 3 });
}

function liquidityTag(volume) {
  if (volume >= 5000) return { cls: "good", text: "流動性高" };
  if (volume >= 500) return { cls: "warn", text: "流動性中" };
  return { cls: "bad", text: "流動性低" };
}

function trendHtml(t) {
  if (t == null) return '<span class="trend flat">—</span>';
  const cls = t > 0.5 ? "up" : t < -0.5 ? "down" : "flat";
  const arrow = t > 0.5 ? "▲" : t < -0.5 ? "▼" : "▬";
  return `<span class="trend ${cls}">${arrow} ${fmt(t, 1)}%</span>`;
}

function curName(id) {
  return state.byId.get(id)?.name || id;
}

// ---------- 抓資料 ----------
async function load() {
  const league = $("#league").value;
  setStatus("更新中…");
  try {
    const r = await fetch(`/api/currency?league=${encodeURIComponent(league)}`);
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || `HTTP ${r.status}`);
    }
    const data = await r.json();
    state.data = data;
    state.byId = new Map(data.currencies.map((c) => [c.id, c]));
    render();
    const t = new Date(data.fetchedAt);
    setStatus(
      `聯盟：${data.league} · 共 ${data.currencies.length} 種通貨 · 牌價更新於 ${t.toLocaleTimeString(
        "zh-TW"
      )}`
    );
  } catch (err) {
    setStatus("載入失敗：" + err.message, true);
  }
}

function setStatus(msg, isError = false) {
  const el = $("#status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

// ---------- 渲染 ----------
function render() {
  renderHero();
  renderBoard();
  ensureCalcRows();
  recalc();
}

function getRef() {
  const chaos = state.byId.get("chaos");
  const exalted = state.byId.get("exalted");
  return {
    chaosDV: chaos?.divineValue || null,
    exaltedDV: exalted?.divineValue || null,
  };
}

// 最划算買法重點卡：聚焦混沌石 vs 崇高石，並標出整體最佳流動性
function renderHero() {
  const box = $("#bestRoutes");
  const data = state.data;
  if (!data) return;

  const chaos = state.byId.get("chaos");
  const exalted = state.byId.get("exalted");
  const cards = [];

  // 整體推薦：能直接與神聖石交易、且流動性最高者
  const spendable = data.currencies.filter(
    (c) => c.id !== "divine" && c.perDivine
  );
  const best = spendable
    .slice()
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))[0];

  function card(cur, isBest, badge) {
    if (!cur) return "";
    return `
      <div class="route-card ${isBest ? "best" : ""}">
        ${isBest ? `<span class="badge">${badge || "最划算"}</span>` : ""}
        <div class="rc-head">
          ${cur.image ? `<img src="${cur.image}" alt="" loading="lazy">` : ""}
          <span class="rc-name">${cur.name}</span>
        </div>
        <div class="rc-cost">${fmt(cur.perDivine)} <small>個 / 神聖石</small></div>
        <div class="rc-sub">流動性 ${fmt(cur.volume)} · 7日 ${fmt(cur.trend7d, 1)}%</div>
      </div>`;
  }

  const bestId = best?.id;
  cards.push(card(chaos, bestId === "chaos", "最佳流動性"));
  cards.push(card(exalted, bestId === "exalted", "最佳流動性"));
  if (best && best.id !== "chaos" && best.id !== "exalted") {
    cards.push(card(best, true, "最佳流動性"));
  }

  box.innerHTML = cards.join("");

  // 說明：在牌價(中間價)上兩者價值幾乎相等，差別在流動性與趨勢
  const note = $("#heroNote");
  if (chaos && exalted) {
    const { chaosDV, exaltedDV } = getRef();
    // 用崇高石買 1 神聖石，換算成混沌石價值，對比直接用混沌石
    const exRouteInChaos = exalted.perDivine * (exaltedDV / chaosDV);
    const cheaperByValue =
      Math.abs(exRouteInChaos - chaos.perDivine) < chaos.perDivine * 0.01
        ? null
        : exRouteInChaos < chaos.perDivine
        ? "崇高石"
        : "混沌石";
    note.innerHTML =
      `📌 用 <b>混沌石</b> 買 1 神聖石需 <b>${fmt(chaos.perDivine)}</b> 個；` +
      `用 <b>崇高石</b> 需 <b>${fmt(exalted.perDivine)}</b> 個（價值約等於 ${fmt(
        exRouteInChaos
      )} 混沌石）。` +
      (cheaperByValue
        ? ` 目前 <b>${cheaperByValue}</b> 在牌價上略便宜。`
        : ` 兩者牌價價值幾乎相同 —— 此時<b>流動性</b>就是關鍵：` +
          `市場越深(掛單越多)，實際成交越接近牌價、價差損失越小，所以「${curName(
            bestId
          )}」通常是實際最划算的選擇。`);
  }
}

function renderBoard() {
  const data = state.data;
  const { chaosDV, exaltedDV } = getRef();
  const q = ($("#search").value || "").trim().toLowerCase();
  const rows = data.currencies
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.includes(q))
    .map((c) => {
      const isDivine = c.id === "divine";
      const exEq = exaltedDV ? c.divineValue / exaltedDV : null;
      const chEq = chaosDV ? c.divineValue / chaosDV : null;
      const lt = liquidityTag(c.volume);
      const pair =
        c.maxVolumeCurrency && c.maxVolumeRate
          ? `↔ ${curName(c.maxVolumeCurrency)} @ ${fmt(c.maxVolumeRate)}`
          : "—";
      return `
        <tr class="${isDivine ? "row-divine" : ""}">
          <td>
            <div class="cur-cell">
              ${c.image ? `<img src="${c.image}" alt="" loading="lazy">` : ""}
              <span class="cn">${c.name}</span>
            </div>
          </td>
          <td class="num">${isDivine ? "—" : fmt(c.perDivine)}</td>
          <td class="num">${fmt(c.divineValue, 4)}</td>
          <td class="num">${fmt(exEq, 3)}</td>
          <td class="num">${fmt(chEq, 3)}</td>
          <td class="num">${trendHtml(c.trend7d)}</td>
          <td class="num">${fmt(c.volume)} <span class="tag ${lt.cls}">${lt.text}</span></td>
          <td>${pair}</td>
        </tr>`;
    })
    .join("");
  $("#boardBody").innerHTML = rows || `<tr><td colspan="8">查無符合的通貨</td></tr>`;
}

// ---------- 庫存換算器 ----------
function currencyOptions(selectedId) {
  return state.data.currencies
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${c.name}</option>`
    )
    .join("");
}

function addCalcRow(selectedId = "", qty = "") {
  const tr = document.createElement("tr");
  tr.className = "calc-row";
  tr.innerHTML = `
    <td><select class="c-cur">${currencyOptions(selectedId)}</select></td>
    <td class="num"><input class="c-qty" type="number" min="0" step="any" value="${qty}" placeholder="0"></td>
    <td class="num c-unit">—</td>
    <td class="num c-sub">—</td>
    <td class="num c-pct">—</td>
    <td><button class="del" title="刪除">✕</button></td>`;
  $("#calcBody").appendChild(tr);
  tr.querySelector(".c-cur").addEventListener("change", recalc);
  tr.querySelector(".c-qty").addEventListener("input", recalc);
  tr.querySelector(".del").addEventListener("click", () => {
    tr.remove();
    recalc();
  });
}

// 首次有資料時，預設放混沌石與崇高石兩列
function ensureCalcRows() {
  if ($("#calcBody").children.length === 0) {
    addCalcRow("chaos", "");
    addCalcRow("exalted", "");
  } else {
    // 資料重整後刷新每列的下拉選單（保留選擇）
    $("#calcBody")
      .querySelectorAll(".calc-row")
      .forEach((tr) => {
        const sel = tr.querySelector(".c-cur");
        const cur = sel.value;
        sel.innerHTML = currencyOptions(cur);
      });
  }
}

function recalc() {
  if (!state.data) return;
  const rows = [...$("#calcBody").querySelectorAll(".calc-row")];
  let total = 0;
  const parts = [];

  rows.forEach((tr) => {
    const id = tr.querySelector(".c-cur").value;
    const qty = parseFloat(tr.querySelector(".c-qty").value) || 0;
    const cur = state.byId.get(id);
    const unit = cur?.divineValue || 0;
    const sub = qty * unit;
    total += sub;
    tr.querySelector(".c-unit").textContent = fmt(unit, 4);
    tr.querySelector(".c-sub").textContent = fmt(sub, 4);
    tr._sub = sub;
    tr._cur = cur;
    if (qty > 0 && cur) parts.push({ cur, qty, sub });
  });

  rows.forEach((tr) => {
    const pct = total > 0 ? (tr._sub / total) * 100 : 0;
    tr.querySelector(".c-pct").textContent = total > 0 ? fmt(pct, 1) + "%" : "—";
  });

  $("#calcTotal").textContent = fmt(total, 4);

  const res = $("#calcResult");
  if (total <= 0) {
    res.innerHTML = "";
    return;
  }

  // 推薦：手上持有中，流動性最高者拿去換神聖石最不吃價差
  const bestHold = parts.slice().sort((a, b) => (b.cur.volume || 0) - (a.cur.volume || 0))[0];
  const whole = Math.floor(total);
  const remain = total - whole;

  res.innerHTML = `
    <div class="big">
      你的庫存總共值
      <span class="divines">${fmt(total, 3)}</span> 顆神聖石
      <div style="color:var(--muted);font-size:13px;margin-top:4px">
        ≈ ${whole} 顆神聖石${remain > 0.001 ? `（再加 ${fmt(remain, 3)} 顆的零頭）` : ""}
      </div>
      ${
        bestHold
          ? `<div class="reco">💡 想換成神聖石的話，優先拿 <b>${bestHold.cur.name}</b> 去換：
             它是你持有中市場最深(流動性 ${fmt(bestHold.cur.volume)})的通貨，實際成交價差最小。</div>`
          : ""
      }
    </div>`;
}

// ---------- 事件 ----------
function startAuto() {
  clearInterval(state.timer);
  if ($("#autoRefresh").checked) {
    state.timer = setInterval(load, 60 * 1000);
  }
}

$("#refresh").addEventListener("click", load);
$("#league").addEventListener("change", load);
$("#search").addEventListener("input", () => state.data && renderBoard());
$("#addRow").addEventListener("click", () => addCalcRow());
$("#autoRefresh").addEventListener("change", startAuto);

load();
startAuto();
