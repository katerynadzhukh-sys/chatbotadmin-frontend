# Step 1: Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install


# Copy the rest of the application files and build
COPY . .
RUN npm run build

# Step 2: Production serve stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY widget-test /usr/share/nginx/html/test-widget

# Copy custom nginx configuration for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
