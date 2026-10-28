# IRON LYNX – jeden kontajner: Node.js server = statické súbory hry + WebSocket signalizácia
# Grafika (public/assets) je už vygenerovaná v repozitári, Python v kontajneri netreba.

# Základný obraz sa dá zmeniť: docker build --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-alpine .
ARG NODE_IMAGE=node:22-alpine

# --- 1) build hry (Vite) ---
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- 2) runtime: iba server + hotový dist ---
FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production PORT=8080 STATIC_DIR=dist
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "server/signal.js"]
