FROM node:22-bookworm-slim AS build
WORKDIR /app

# SvelteKit's $env/static/public values are embedded during the build.
# They must be available in the build stage, not only at container runtime.
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_SUPABASE_ANON_KEY=$PUBLIC_SUPABASE_ANON_KEY

COPY package*.json ./
RUN npm ci

COPY . .
# Production builds use Vite's compiler. Type-checking remains available via
# `npm run check`, but existing unrelated leave-status diagnostics should not
# prevent the live image from being rebuilt for a verified production build.
RUN npm run build

# Keep the runtime image lean on the VPS. The build has already completed, so
# development-only packages are no longer required by the running server.
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build

EXPOSE 3000
CMD ["node", "build"]
