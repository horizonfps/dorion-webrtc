FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY services/stream-server ./services/stream-server
RUN pnpm build:stream-server

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist/stream-server/index.js ./index.js

USER node
EXPOSE 8787
CMD ["node", "index.js"]
