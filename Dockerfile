# Build stage
FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Accept build-time args (Easypanel passes env vars as build args too)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ADMIN_MASTER_PASSWORD

# Make them available to Vite during build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_ADMIN_MASTER_PASSWORD=$VITE_ADMIN_MASTER_PASSWORD

RUN npm run build

# Production stage
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config to handle SPA routing
RUN printf "server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
    try_files \$uri \$uri/ /index.html;\n\
    }\n\
    # Cache static assets\n\
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
    expires 1y;\n\
    add_header Cache-Control \"public, immutable\";\n\
    }\n\
    }" > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
