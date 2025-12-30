package assets

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/minio/minio-go/v7"

	"lecture/internal/config"
	"lecture/internal/rangeutil"
)

type Handler struct {
	bucket          string
	cacheControlOverride  string
	cacheControlDefault   string
	cacheControlImmutable string
	allowedPrefixes []string
	minio           *minio.Client
}

func New(cfg config.Config, minioClient *minio.Client) *Handler {
	return &Handler{
		bucket:          cfg.MinIOBucket,
		cacheControlOverride:  cfg.AssetCacheControl,
		cacheControlDefault:   cfg.AssetCacheControlDefault,
		cacheControlImmutable: cfg.AssetCacheControlImmutable,
		allowedPrefixes: cfg.AssetAllowedPrefixes,
		minio:           minioClient,
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !strings.HasPrefix(r.URL.Path, "/assets/") {
		http.Error(w, "invalid asset path", http.StatusBadRequest)
		return
	}

	key := strings.TrimPrefix(r.URL.Path, "/assets/")
	if key == "" || key == "/" {
		http.Error(w, "missing asset key", http.StatusBadRequest)
		return
	}

	key = strings.TrimPrefix(key, "/")
	if err := validateObjectKey(key); err != nil {
		http.Error(w, "invalid asset key", http.StatusBadRequest)
		return
	}
	if !h.isAllowedKey(key) {
		http.Error(w, "asset key not allowed", http.StatusForbidden)
		return
	}

	ctx := r.Context()
	info, err := h.minio.StatObject(ctx, h.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		if isNotFound(err) {
			http.Error(w, "asset not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to stat asset", http.StatusBadGateway)
		return
	}
	if info.Size <= 0 {
		http.Error(w, "asset empty", http.StatusNotFound)
		return
	}

	cacheControl := h.cacheControlOverride
	if cacheControl == "" {
		if isImmutableAssetKey(key) {
			cacheControl = h.cacheControlImmutable
		} else {
			cacheControl = h.cacheControlDefault
		}
	}
	if cacheControl != "" {
		w.Header().Set("Cache-Control", cacheControl)
	}

	etag := strings.TrimSpace(info.ETag)
	if etag != "" {
		w.Header().Set("ETag", fmt.Sprintf("%q", etag))
		if inm := strings.TrimSpace(r.Header.Get("If-None-Match")); inm != "" {
			if strings.Trim(inm, "\"") == etag {
				w.WriteHeader(http.StatusNotModified)
				return
			}
		}
	}

	if !info.LastModified.IsZero() {
		w.Header().Set("Last-Modified", info.LastModified.UTC().Format(http.TimeFormat))
	}

	contentType := strings.TrimSpace(info.ContentType)
	if contentType == "" {
		contentType = mime.TypeByExtension(path.Ext(key))
		if contentType == "" {
			contentType = "application/octet-stream"
		}
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	if rangeHeader := strings.TrimSpace(r.Header.Get("Range")); rangeHeader != "" {
		br, err := rangeutil.ParseSingleRange(rangeHeader, info.Size)
		if err != nil {
			w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", info.Size))
			http.Error(w, "invalid range", http.StatusRequestedRangeNotSatisfiable)
			return
		}

		obj, err := h.getObjectRange(ctx, key, br)
		if err != nil {
			http.Error(w, "failed to fetch asset", http.StatusBadGateway)
			return
		}
		defer obj.Close()

		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", br.Start, br.End, info.Size))
		w.Header().Set("Content-Length", strconv.FormatInt(br.Length(), 10))
		w.WriteHeader(http.StatusPartialContent)
		if r.Method == http.MethodHead {
			return
		}

		_, _ = io.CopyN(w, obj, br.Length())
		return
	}

	obj, err := h.minio.GetObject(ctx, h.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		if isNotFound(err) {
			http.Error(w, "asset not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to fetch asset", http.StatusBadGateway)
		return
	}
	defer obj.Close()

	w.Header().Set("Content-Length", strconv.FormatInt(info.Size, 10))
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}

	_, _ = io.Copy(w, obj)
}

func (h *Handler) getObjectRange(ctx context.Context, key string, br rangeutil.ByteRange) (*minio.Object, error) {
	opts := minio.GetObjectOptions{}
	if err := opts.SetRange(br.Start, br.End); err != nil {
		return nil, err
	}
	return h.minio.GetObject(ctx, h.bucket, key, opts)
}

func (h *Handler) isAllowedKey(key string) bool {
	if len(h.allowedPrefixes) == 0 {
		return true
	}
	for _, p := range h.allowedPrefixes {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if strings.HasPrefix(key, p) {
			return true
		}
	}
	return false
}

func validateObjectKey(key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return errors.New("empty key")
	}
	if strings.Contains(key, "\\") {
		return errors.New("backslash not allowed")
	}
	if strings.HasPrefix(key, "/") {
		return errors.New("absolute path not allowed")
	}

	segments := strings.Split(key, "/")
	for _, seg := range segments {
		if seg == "" {
			return errors.New("empty path segment")
		}
		if seg == "." || seg == ".." {
			return errors.New("dot segment not allowed")
		}
	}

	return nil
}

func isNotFound(err error) bool {
	resp := minio.ToErrorResponse(err)
	if resp.Code == "NoSuchKey" || resp.Code == "NoSuchBucket" {
		return true
	}
	if resp.StatusCode == http.StatusNotFound {
		return true
	}

	// Some errors come wrapped; fall back to string match as last resort.
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "nosuchkey") || strings.Contains(msg, "not found") {
		return true
	}
	return false
}

func isImmutableAssetKey(key string) bool {
	// Convention:
	// - prefer immutable object keys like: "foo.v20251227T120102Z.pdf"
	// - update YAML to point to a new key instead of overwriting in-place
	base := path.Base(key)
	idx := strings.LastIndex(base, ".v")
	if idx == -1 || idx+2 >= len(base) {
		return false
	}
	c := base[idx+2]
	return c >= '0' && c <= '9'
}
