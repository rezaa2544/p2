FROM node:22-bookworm-slim

ARG M15_RUN_INSTANCE
LABEL io.payesh.m15-01.run="${M15_RUN_INSTANCE}"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && mkdir -p /run/m15 /app/server/data /app/tools \
  && chmod 711 /run/m15 \
  && chmod 700 /app/server/data \
  && chown -R node:node /run/m15 /app/server /app/tools

COPY --chown=node:node server/ ./server/
COPY --chown=node:node authz/write-perms.json ./authz/write-perms.json
COPY --chown=node:node index.html USER_GUIDE.html account-deletion.html privacy.html ./
COPY --chown=node:node tools/m15-01-route-load.js ./tools/m15-01-route-load.js
ENV NODE_ENV=test
USER node
CMD ["node", "server/index.js"]
