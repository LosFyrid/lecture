package server

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"lecture/internal/assets"
	"lecture/internal/config"
	minioclient "lecture/internal/minio"
)

type Server struct {
	router *chi.Mux
}

func New(cfg config.Config) (*Server, error) {
	minioClient, err := minioclient.New(cfg)
	if err != nil {
		return nil, err
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok\n"))
	})

	assetHandler := assets.New(cfg, minioClient)
	r.Method(http.MethodGet, "/assets/*", assetHandler)
	r.Method(http.MethodHead, "/assets/*", assetHandler)

	// Optional: future API namespace placeholder.
	r.Get("/api/v1/ping", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	return &Server{router: r}, nil
}

func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Ensure a consistent server header policy (avoid leaking versions).
		w.Header().Del("Server")
		s.router.ServeHTTP(w, r)
	})
}

func (s *Server) String() string {
	return fmt.Sprintf("Server(router=%T)", s.router)
}

