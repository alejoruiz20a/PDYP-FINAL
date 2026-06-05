# ---- Etapa de build: compila la SPA con pnpm ----
FROM node:20-slim AS build

# Habilita pnpm via corepack (incluido en node 20)
RUN corepack enable

WORKDIR /app

# La URL del gateway se inyecta en build (Vite la embebe en el bundle)
ARG VITE_API_GATEWAY_URL=http://localhost:8080
ENV VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL

# Cache de dependencias
COPY package.json ./
RUN pnpm install

# Copia el código y construye
COPY . .
RUN pnpm build

# ---- Etapa de runtime: sirve los estáticos con nginx ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
