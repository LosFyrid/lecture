FROM node:22-alpine AS deps

WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/web/node_modules ./web/node_modules
COPY web ./web
COPY content ./content

WORKDIR /app/web
ENV NODE_ENV=production
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/web/public ./public
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]

