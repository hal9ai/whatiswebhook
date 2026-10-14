FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV PORT=8080 NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
