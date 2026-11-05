# Bayit for any machine (amd64 and arm64). Build from the repository root:
#   docker compose up -d --build        (uses compose.yaml)
#   docker build -f app/host/Dockerfile -t bayit .
# See docs/self-hosting-docker.md.

FROM node:24-alpine AS build
WORKDIR /src
COPY app/package.json app/package-lock.json app/
RUN cd app && npm ci --no-audit --no-fund
COPY shared shared
COPY design-system design-system
COPY app app
RUN cd app && npm run build:cloud && node host/build-host.mjs

FROM node:24-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
WORKDIR /app
COPY --from=build /src/app/dist/host ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--disable-warning=ExperimentalWarning","server.mjs"]
