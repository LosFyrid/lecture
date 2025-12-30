package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	ListenAddr string

	MinIOEndpoint        string
	MinIOUseSSL          bool
	MinIOAccessKeyID     string
	MinIOSecretAccessKey string
	MinIOBucket          string
	MinIORegion          string

	// AssetCacheControl overrides all Cache-Control decisions if non-empty.
	// Prefer leaving this empty and using AssetCacheControlDefault/Immutable
	// with versioned (immutable) object keys.
	AssetCacheControl string

	AssetCacheControlDefault   string
	AssetCacheControlImmutable string
	AssetAllowedPrefixes []string
}

func Load() (Config, error) {
	cfg := Config{
		ListenAddr:         getEnv("LISTEN_ADDR", ":8080"),
		MinIOEndpoint:      strings.TrimSpace(os.Getenv("MINIO_ENDPOINT")),
		MinIOAccessKeyID:   strings.TrimSpace(os.Getenv("MINIO_ACCESS_KEY_ID")),
		MinIOSecretAccessKey: strings.TrimSpace(os.Getenv("MINIO_SECRET_ACCESS_KEY")),
		MinIOBucket:        strings.TrimSpace(os.Getenv("MINIO_BUCKET")),
		MinIORegion:        getEnv("MINIO_REGION", "us-east-1"),
		AssetCacheControl:  strings.TrimSpace(os.Getenv("ASSET_CACHE_CONTROL")),
		AssetCacheControlDefault:   getEnv("ASSET_CACHE_CONTROL_DEFAULT", "public, max-age=3600"),
		AssetCacheControlImmutable: getEnv("ASSET_CACHE_CONTROL_IMMUTABLE", "public, max-age=31536000, immutable"),
		AssetAllowedPrefixes: splitCSV(os.Getenv("ASSET_ALLOWED_PREFIXES")),
	}

	if endpoint := cfg.MinIOEndpoint; endpoint == "" {
		return Config{}, errors.New("MINIO_ENDPOINT is required")
	}

	// Allow MINIO_ENDPOINT to be either host:port or a full URL (http[s]://host:port).
	// If a URL is provided, derive MINIO_USE_SSL from the scheme automatically.
	if strings.Contains(cfg.MinIOEndpoint, "://") {
		parsed, err := url.Parse(cfg.MinIOEndpoint)
		if err != nil {
			return Config{}, fmt.Errorf("MINIO_ENDPOINT url parse: %w", err)
		}
		switch parsed.Scheme {
		case "http":
			cfg.MinIOUseSSL = false
		case "https":
			cfg.MinIOUseSSL = true
		default:
			return Config{}, fmt.Errorf("MINIO_ENDPOINT scheme must be http or https, got %q", parsed.Scheme)
		}
		if parsed.Host == "" {
			return Config{}, errors.New("MINIO_ENDPOINT url must include host")
		}
		cfg.MinIOEndpoint = parsed.Host
	} else {
		cfg.MinIOUseSSL = getEnvBool("MINIO_USE_SSL", true)
	}

	if cfg.MinIOAccessKeyID == "" {
		return Config{}, errors.New("MINIO_ACCESS_KEY_ID is required")
	}
	if cfg.MinIOSecretAccessKey == "" {
		return Config{}, errors.New("MINIO_SECRET_ACCESS_KEY is required")
	}
	if cfg.MinIOBucket == "" {
		return Config{}, errors.New("MINIO_BUCKET is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func getEnvBool(key string, fallback bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return parsed
}

func splitCSV(v string) []string {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		out = append(out, p)
	}
	return out
}
