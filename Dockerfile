# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# vite -> dist/ (client, served statically)
# esbuild -> dist-server/server.cjs (never served; keeps the sourcemap out of the static root)
RUN npm run build

# ---- runtime ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# esbuild runs with --packages=external, so dependencies are resolved from node_modules at runtime.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Cloud Run overrides PORT; this is the local-run default.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist-server/server.cjs"]
