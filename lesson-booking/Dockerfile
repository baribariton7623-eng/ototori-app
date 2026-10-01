# レッスン予約サービス(API + 画面)を 1 つのコンテナで配信する
#   docker build -t lesson-booking --build-arg VITE_AUTH_MODE=supabase ... .
#   docker run -p 8787:8787 --env-file .env lesson-booking
# 画面(web/)の VITE_* はビルド時に埋め込まれるため build-arg で渡す。

# Docker Hub の取得制限にかかる環境では、同じ公式イメージのミラーを指定できる
#   --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-slim
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY web/package.json web/package-lock.json web/.npmrc web/
RUN npm --prefix web ci

COPY tsconfig.json ./
COPY src src
COPY web web

ARG VITE_AUTH_MODE=supabase
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ARG VITE_SERVICE_NAME=レッスン予約
ARG VITE_OPERATOR_NAME=
ARG VITE_OPERATOR_REPRESENTATIVE=
ARG VITE_OPERATOR_ADDRESS=
ARG VITE_OPERATOR_PHONE=
ARG VITE_OPERATOR_EMAIL=
ARG VITE_PRO_PRICE=
ARG VITE_ORG_SEAT_PRICE=
ARG VITE_LEGAL_EFFECTIVE_DATE=
ENV VITE_AUTH_MODE=$VITE_AUTH_MODE VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SERVICE_NAME=$VITE_SERVICE_NAME VITE_OPERATOR_NAME=$VITE_OPERATOR_NAME \
    VITE_OPERATOR_REPRESENTATIVE=$VITE_OPERATOR_REPRESENTATIVE VITE_OPERATOR_ADDRESS=$VITE_OPERATOR_ADDRESS \
    VITE_OPERATOR_PHONE=$VITE_OPERATOR_PHONE VITE_OPERATOR_EMAIL=$VITE_OPERATOR_EMAIL VITE_PRO_PRICE=$VITE_PRO_PRICE \
    VITE_ORG_SEAT_PRICE=$VITE_ORG_SEAT_PRICE VITE_LEGAL_EFFECTIVE_DATE=$VITE_LEGAL_EFFECTIVE_DATE

RUN npm run build && npm --prefix web run build && npm prune --omit=dev

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production PORT=8787 WEB_DIST=web/dist
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/web/dist web/dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
