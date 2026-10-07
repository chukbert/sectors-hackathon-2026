FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && mkdir -p public

# Hasil build saja (server standalone + aset statis). tools/deploy.sh mengambil tahap ini di laptop
# (`docker build --target artifact --output …`) lalu VPS cukup menyalinnya: tidak ada npm install/next build di server.
FROM scratch AS artifact
COPY --from=build /app/.next/standalone /
COPY --from=build /app/.next/static /.next/static
COPY --from=build /app/public /public

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=artifact / ./
EXPOSE 3000
CMD ["node", "server.js"]
