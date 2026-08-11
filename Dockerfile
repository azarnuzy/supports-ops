FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk add --no-cache openssl \
  && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/logger/package.json packages/logger/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/logger packages/logger

RUN DATABASE_URL="postgresql://postgres:postgres@postgres:5432/monorepo_template?schema=public" pnpm db:generate
RUN pnpm --filter @repo/api build

ENV NODE_ENV=production

EXPOSE 8000

CMD ["pnpm", "--filter", "@repo/api", "start"]
