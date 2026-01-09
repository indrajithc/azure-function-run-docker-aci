# ---- Base image ----
FROM node:20-alpine

# ---- App directory ----
WORKDIR /app

# ---- Install only required package ----
RUN npm init -y \
  && npm install @azure/storage-blob

# ---- Copy app ----
COPY app.js .

# ---- Run app ----
CMD ["node", "app.js"]
