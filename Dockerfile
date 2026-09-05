# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# vite -> dist/ (client, served statically)
# esbuild -> dist-server/server.cjs (never served; keeps the sourcemap out of the static root)
RUN npm run build
# Reduce the tree we already resolved instead of resolving a second one. The runtime stage
# used to run its own `npm ci --omit=dev`, which meant every deploy paid for two full
# installs of the same lockfile.
RUN npm prune --omit=dev

# ---- runtime ----
FROM node:22-slim
WORKDIR /app
# Cloud Run overrides PORT; 8080 is the local-run default.
ENV NODE_ENV=production \
    PORT=8080
# esbuild runs with --packages=external, so dependencies are resolved from node_modules at
# runtime — carried over from the build stage, already pruned to production dependencies.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# The base image ships an unprivileged `node` user. Nothing here writes to the filesystem —
# the file store is only reachable when FIRESTORE_PROJECT_ID is unset, which is not a
# deployable configuration for group mode.
USER node
EXPOSE 8080
CMD ["node", "dist-server/server.cjs"]
