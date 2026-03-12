# ── Stage 1: Build ───────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm ci

# Copia todo o código
COPY . .

# Variáveis de ambiente injetadas no build do Vite
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ADMIN_MASTER_PASSWORD

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_ADMIN_MASTER_PASSWORD=$VITE_ADMIN_MASTER_PASSWORD

RUN npm run build

# ── Stage 2: Serve com Nginx ──────────────────────────────────
FROM nginx:stable-alpine
WORKDIR /app

# Copia apenas a pasta compilada
COPY --from=builder /app/dist /usr/share/nginx/html

# Configuração do nginx para SPA (React Router) na porta 3000
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
