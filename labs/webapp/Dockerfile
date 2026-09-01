# =============================================================================
# RAD 321 — Static WebApp Nginx Dockerfile for Dokploy (Port 3000)
# =============================================================================

FROM nginx:alpine

# Configure Nginx to listen on port 3000
RUN sed -i 's/listen       80;/listen       3000;/g' /etc/nginx/conf.d/default.conf

# Copy webapp static files
COPY . /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
