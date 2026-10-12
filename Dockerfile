FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM caddy:2-alpine
COPY --from=web /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
