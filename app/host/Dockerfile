# Bayit for any machine (amd64 and arm64). Build from the repository root:
#   docker compose up -d --build        (uses compose.yaml)
#   docker build -f app/host/Dockerfile -t bayit .
# See docs/self-hosting-docker.md.

FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS build
WORKDIR /src
COPY app/package.json app/package-lock.json app/
RUN cd app && npm ci --no-audit --no-fund
COPY shared shared
COPY design-system design-system
COPY app app
RUN cd app && npm run build:cloud && node host/build-host.mjs

FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data
WORKDIR /app
# The application and operator CLIs are bundled; package managers are not part of the runtime.
# Alpine security fixes released after the pinned base image (e.g. zlib CVE-2026-4738).
RUN apk upgrade --no-cache && rm -rf /usr/local/lib/node_modules /opt/yarn-v* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack
COPY --from=build /src/app/dist/host ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "require('node:http').get({hostname:'127.0.0.1',port:process.env.PORT||8080,path:'/api/health',headers:{Host:new URL(process.env.BAYIT_ORIGIN||'http://127.0.0.1:8080').host}},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node","--disable-warning=ExperimentalWarning","server.mjs"]
