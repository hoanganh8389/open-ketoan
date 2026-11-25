FROM node:22-alpine
COPY . /app
CMD ["node", "dist/main.js"]
