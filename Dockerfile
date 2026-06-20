# Cloud Run 用 — 輕量 Node 容器
FROM node:20-alpine

WORKDIR /app

# 先裝相依套件（利用 layer 快取）
COPY package.json ./
RUN npm install --omit=dev

# 複製其餘程式
COPY server.js ./
COPY public ./public

# Cloud Run 會以 $PORT 注入監聽埠（預設 8080）
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
