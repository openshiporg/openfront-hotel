# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json npm-shrinkwrap.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder
WORKDIR /app
COPY . .
# Keystone validates production configuration while generating the build. These
# values are build-stage only and are not copied into the runtime image.
ARG BUILD_SITE_URL=https://hotel.invalid
ARG BUILD_SESSION_SECRET=build-stage-session-secret-with-more-than-32-characters
ARG BUILD_HOTEL_DATA_KEY=build-stage-encryption-secret-with-more-than-32-characters
ARG BUILD_HOTEL_QUOTE_SECRET=build-stage-quote-secret-with-more-than-32-characters
ENV NODE_ENV=production \
    DATABASE_URL=postgresql://build:build@db.invalid:5432/build \
    SESSION_SECRET=$BUILD_SESSION_SECRET \
    HOTEL_DATA_ENCRYPTION_KEY=$BUILD_HOTEL_DATA_KEY \
    HOTEL_QUOTE_SECRET=$BUILD_HOTEL_QUOTE_SECRET \
    NEXT_PUBLIC_SITE_URL=$BUILD_SITE_URL \
    NEXTAUTH_URL=$BUILD_SITE_URL \
    TRUST_PROXY=off
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/npm-shrinkwrap.json ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/.keystone ./.keystone
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations
COPY --from=builder --chown=nextjs:nodejs /app/schema.prisma /app/schema.graphql ./
USER nextjs
EXPOSE 3000
# Container health is liveness so a fresh deployment can remain up for setup;
# route traffic only after the stricter /api/ready contract returns 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]
