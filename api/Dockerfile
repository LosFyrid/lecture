FROM golang:1.25 AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/lecture-api ./cmd/lecture-api

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/lecture-api /lecture-api

EXPOSE 8080
USER nonroot:nonroot

ENTRYPOINT ["/lecture-api"]

