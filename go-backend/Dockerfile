# syntax=docker/dockerfile:1

# ---- build ----------------------------------------------------------------
FROM golang:1.26-alpine AS build
WORKDIR /src

# Resolve dependencies first (cached layer).
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -ldflags "-s -w" -o /out/server ./cmd/server
RUN CGO_ENABLED=0 go build -ldflags "-s -w" -o /out/migrate ./cmd/migrate

# ---- runtime --------------------------------------------------------------
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app
USER app
WORKDIR /app
COPY --from=build /out/server /app/server
COPY --from=build /out/migrate /app/migrate
EXPOSE 8080
ENTRYPOINT ["/app/server"]
