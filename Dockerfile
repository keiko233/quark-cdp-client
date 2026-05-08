FROM denoland/deno:latest

WORKDIR /app

COPY . .

RUN deno cache main.ts

EXPOSE 3000

CMD ["deno", "task", "start"]