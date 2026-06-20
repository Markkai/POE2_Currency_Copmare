# POE2 神聖石比價 · Divine Orb Compare

對齊 [poe.ninja](https://poe.ninja/poe2/economy/runesofaldur/currency) 的 POE2 即時通貨匯率，
讓你隨時知道**用哪一種石頭買神聖石 (Divine Orb) 最划算**。

## 功能

- **💰 最划算買法重點卡**：直接比較用「混沌石 vs 崇高石」買 1 顆神聖石各需多少，
  並標出整體流動性最高（實際成交最划算）的通貨。
- **📊 神聖石價格看板**：49 種通貨的即時牌價，顯示「買 1 神聖石需要幾個」、
  換算成崇高石/混沌石、7 日趨勢、市場流動性與最深交易配對。可搜尋。
- **🧮 庫存換算器**：輸入手上有的石頭數量，算出總共值多少神聖石、以及哪種拿去換最不吃價差。
- 每分鐘自動更新，後端對 poe.ninja 做 60 秒快取。

## 一個重要觀念

poe.ninja 的牌價是**自洽（可遞移）**的 —— 純就牌價而言，用混沌石或崇高石買神聖石的
*總價值幾乎相等*。真正的「比較便宜」來自**流動性 / 價差**：市場越深（掛單越多），
實際成交越貼近牌價、損失越小。本站因此把流動性放在顯眼位置，並以它來推薦最划算的買法。

## 資料來源

poe.ninja 未公開的 POE2 端點（由後端代理以避開 CORS）：

```
GET https://poe.ninja/poe2/api/economy/exchange/current/overview?league=<聯盟>&type=Currency
```

`primaryValue` = 該通貨 1 個值多少神聖石；`maxVolumeCurrency/Rate` = 最深交易配對；
`sparkline.totalChange` = 7 日變化。圖示來自 `https://web.poecdn.com`。

## 本機執行（正式版，需 Node 18+）

```bash
npm install
npm start
# 開啟 http://localhost:8080
```

可用環境變數 `POE2_LEAGUE` 換預設聯盟，`PORT` 換埠號。

## 免裝 Node 的快速預覽（用 Python）

機器上若還沒裝 Node，可用內附的對等 Python 伺服器先看效果：

```bash
python _verify_server.py
# 開啟 http://localhost:8080
```

> `_verify_server.py` 僅複製 `server.js` 的代理 / 轉換邏輯供本機預覽，**部署請用 Node 版的 `server.js`**。

## 部署到 Google Cloud Run

與你朋友現有的網站一致，用容器部署：

```bash
gcloud run deploy poe2-divine-compare \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated
```

（已附 `Dockerfile`，容器會以 Cloud Run 注入的 `$PORT` 監聽。）

## 檔案結構

```
server.js            Express 後端：/api/currency 代理 + 靜態前端 + 快取
public/index.html    版面
public/styles.css    樣式（深色 POE 風）
public/app.js        前端邏輯：看板、重點卡、庫存換算器
Dockerfile           Cloud Run 容器
_verify_server.py    （選用）免裝 Node 的本機預覽
```
