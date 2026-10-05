# --- Dépendances ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_BRAND="Tech Teranga"
ENV NEXT_PUBLIC_BRAND=$NEXT_PUBLIC_BRAND
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Exécution ---
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# ffmpeg (avec libass et polices) pour le montage du Studio vidéo
RUN apk add --no-cache ffmpeg fontconfig \
 && addgroup -S app && adduser -S app -G app \
 && mkdir -p /app/media && chown app:app /app/media
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/db ./db
COPY --from=build --chown=app:app /app/assets ./assets
USER app
EXPOSE 3000
CMD ["node", "server.js"]
