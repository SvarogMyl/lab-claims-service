# linux/arm64 (Oracle Cloud Ampere A1)
FROM --platform=$BUILDPLATFORM node:20-slim AS build

RUN apt-get update && apt-get install -y openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

FROM node:20-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/openspec ./openspec

EXPOSE 3004

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
