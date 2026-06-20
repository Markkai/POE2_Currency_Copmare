import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 8080;

const NINJA_BASE = "https://poe.ninja/poe2/api/economy/exchange/current/overview";
const IMAGE_BASE = "https://web.poecdn.com";
const DEFAULT_LEAGUE = process.env.POE2_LEAGUE || "Runes of Aldur";

// poe.ninja 沒有公開 CORS，所以由後端代理抓取。
// 對同一 league/type 做短暫快取，避免頻繁打 poe.ninja。
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // key -> { ts, payload }

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function absImage(img) {
  if (!img) return null;
  if (/^https?:\/\//.test(img)) return img;
  return IMAGE_BASE + img;
}

// 把 poe.ninja 原始資料整理成前端好用的形狀。
// primaryValue = 該通貨「1 個」值多少神聖石(divine)。
function transform(raw, league, type) {
  const items = new Map((raw.items || []).map((it) => [it.id, it]));
  const currencies = (raw.lines || [])
    .map((ln) => {
      const meta = items.get(ln.id) || {};
      const divineValue = ln.primaryValue; // 1 個此通貨 = 多少神聖石
      return {
        id: ln.id,
        name: meta.name || ln.id,
        detailsId: meta.detailsId || ln.id,
        image: absImage(meta.image),
        divineValue, // 單位價值（以神聖石計）
        perDivine: divineValue > 0 ? 1 / divineValue : null, // 買 1 神聖石需要幾個
        volume: ln.volumePrimaryValue ?? 0, // 流動性（越大越好換、價差越小）
        maxVolumeCurrency: ln.maxVolumeCurrency ?? null,
        maxVolumeRate: ln.maxVolumeRate ?? null,
        trend7d: ln.sparkline?.totalChange ?? null,
        sparkline: ln.sparkline?.data ?? [],
      };
    })
    .sort((a, b) => (b.divineValue || 0) - (a.divineValue || 0));

  return {
    league,
    type,
    fetchedAt: new Date().toISOString(),
    primary: raw.core?.primary || "divine",
    secondary: raw.core?.secondary || "chaos",
    rates: raw.core?.rates || {},
    currencies,
  };
}

app.get("/api/currency", async (req, res) => {
  const league = (req.query.league || DEFAULT_LEAGUE).toString();
  const type = (req.query.type || "Currency").toString();
  const key = `${league}::${type}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    res.set("X-Cache", "HIT");
    return res.json(hit.payload);
  }

  const url = `${NINJA_BASE}?league=${encodeURIComponent(
    league
  )}&type=${encodeURIComponent(type)}`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Referer: "https://poe.ninja/poe2/economy",
      },
    });

    if (!r.ok) {
      // 若 poe.ninja 回錯但有舊快取，回舊資料比整個壞掉好。
      if (hit) {
        res.set("X-Cache", "STALE");
        return res.json(hit.payload);
      }
      const body = await r.text();
      return res
        .status(502)
        .json({ error: `poe.ninja 回應 ${r.status}`, detail: body.slice(0, 300) });
    }

    const raw = await r.json();
    const payload = transform(raw, league, type);
    cache.set(key, { ts: Date.now(), payload });
    res.set("X-Cache", "MISS");
    res.json(payload);
  } catch (err) {
    if (hit) {
      res.set("X-Cache", "STALE");
      return res.json(hit.payload);
    }
    res.status(502).json({ error: "抓取 poe.ninja 失敗", detail: String(err) });
  }
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`POE2 Divine Compare 已啟動 → http://localhost:${PORT}`);
  console.log(`預設聯盟: ${DEFAULT_LEAGUE}`);
});
