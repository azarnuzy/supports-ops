FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk add --no-cache openssl \
  && corepack enable

WORKDIR /app

FROM base AS build

COPY . .

RUN pnpm install --frozen-lockfile

RUN DATABASE_URL="postgresql://postgres:postgres@postgres:5432/supportops?schema=public" pnpm db:generate

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

ARG VITE_WIDGET_URL
ENV VITE_WIDGET_URL=${VITE_WIDGET_URL}

RUN pnpm --filter @repo/platform build \
  && pnpm --filter @repo/widget build

FROM build AS api

ENV NODE_ENV=production
ENV API_PORT=8000

EXPOSE 8000

CMD ["pnpm", "--filter", "@repo/api", "exec", "tsx", "src/main.ts"]

FROM build AS worker

ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@repo/worker", "exec", "tsx", "src/main.ts"]

FROM caddy:2-alpine AS platform

COPY deploy/Caddyfile.static /etc/caddy/Caddyfile
COPY --from=build /app/apps/platform/dist /srv

EXPOSE 80

FROM caddy:2-alpine AS widget

COPY deploy/Caddyfile.static /etc/caddy/Caddyfile
COPY --from=build /app/apps/widget/dist /srv

EXPOSE 80
