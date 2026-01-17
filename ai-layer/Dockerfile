
FROM oven/bun:1.0.25-alpine
WORKDIR /app
RUN apk add --no-cache curl
RUN apk add --no-cache redis
RUN adduser -D sandbox
USER sandbox
COPY --chown=sandbox:sandbox ./ .
ENV PORT=13302
EXPOSE 13302/tcp
CMD sh -c "redis-server --daemonize yes && bun run ai-layer/entrypoint.ts"
