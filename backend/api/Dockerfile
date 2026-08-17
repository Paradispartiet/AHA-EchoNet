# syntax=docker/dockerfile:1.7
FROM node:22.23.2-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build \
  && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22.23.2-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3100
WORKDIR /app
RUN addgroup -S aha && adduser -S -G aha -u 10001 aha
COPY --from=build --chown=aha:aha /app/package.json /app/package-lock.json ./
COPY --from=build --chown=aha:aha /app/node_modules ./node_modules
COPY --from=build --chown=aha:aha /app/dist ./dist
USER aha
EXPOSE 3100
CMD ["node", "dist/main.js"]
