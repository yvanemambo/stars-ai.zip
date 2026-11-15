FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.mjs ./server.mjs
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "server.mjs"]
