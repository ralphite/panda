package server

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"panda/internal/store"
)

const maxUploadBytes = 80 << 20

type Server struct {
	store     *store.Store
	staticDir string
	mux       *http.ServeMux
}

type screenshotDTO struct {
	store.Screenshot
	ImageURL string `json:"imageUrl"`
	PageURL  string `json:"pageUrl"`
}

type createScreenshotRequest struct {
	ImageData   string          `json:"imageData"`
	SourceURL   string          `json:"sourceUrl"`
	PageTitle   string          `json:"pageTitle"`
	Annotations json.RawMessage `json:"annotations"`
}

type createScreenshotResponse struct {
	Screenshot screenshotDTO `json:"screenshot"`
	URL        string        `json:"url"`
}

type updateAnnotationsRequest struct {
	Annotations json.RawMessage `json:"annotations"`
}

func New(st *store.Store, staticDir string) *Server {
	s := &Server{
		store:     st,
		staticDir: staticDir,
		mux:       http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.cors(s.mux)
}

func (s *Server) routes() {
	s.mux.HandleFunc("/api/screenshots", s.handleScreenshotCollection)
	s.mux.HandleFunc("/api/screenshots/", s.handleScreenshotItem)
	s.mux.HandleFunc("/", s.handleApp)
}

func (s *Server) handleScreenshotCollection(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		limit := 100
		if raw := r.URL.Query().Get("limit"); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil {
				limit = parsed
			}
		}
		shots, err := s.store.ListScreenshots(r.Context(), limit)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		dtos := make([]screenshotDTO, 0, len(shots))
		for _, shot := range shots {
			dtos = append(dtos, s.toDTO(shot))
		}
		writeJSON(w, http.StatusOK, map[string]any{"screenshots": dtos})
	case http.MethodPost:
		s.createScreenshot(w, r)
	default:
		w.Header().Set("Allow", "GET, POST, OPTIONS")
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
	}
}

func (s *Server) createScreenshot(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	body := http.MaxBytesReader(w, r.Body, maxUploadBytes)
	var req createScreenshotRequest
	if err := json.NewDecoder(body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("decode request: %w", err))
		return
	}
	if req.ImageData == "" {
		writeError(w, http.StatusBadRequest, errors.New("imageData is required"))
		return
	}

	imageBytes, contentType, err := decodeImageData(req.ImageData)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(imageBytes))
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("imageData is not a supported image: %w", err))
		return
	}

	id, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	shot, err := s.store.CreateScreenshot(r.Context(), store.CreateInput{
		ID:          id,
		Image:       imageBytes,
		ContentType: contentType,
		SourceURL:   req.SourceURL,
		PageTitle:   req.PageTitle,
		Width:       cfg.Width,
		Height:      cfg.Height,
		Annotations: req.Annotations,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, createScreenshotResponse{
		Screenshot: s.toDTO(shot),
		URL:        "/screenshot/" + shot.ID,
	})
}

func (s *Server) handleScreenshotItem(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/screenshots/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, store.ErrNotFound)
		return
	}
	id := parts[0]

	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET, OPTIONS")
			writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
			return
		}
		shot, err := s.store.GetScreenshot(r.Context(), id)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"screenshot": s.toDTO(shot)})
		return
	}

	switch parts[1] {
	case "image":
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET, OPTIONS")
			writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
			return
		}
		s.serveImage(w, r, id)
	case "annotations":
		if r.Method != http.MethodPut {
			w.Header().Set("Allow", "PUT, OPTIONS")
			writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
			return
		}
		s.updateAnnotations(w, r, id)
	default:
		writeError(w, http.StatusNotFound, store.ErrNotFound)
	}
}

func (s *Server) serveImage(w http.ResponseWriter, r *http.Request, id string) {
	shot, err := s.store.GetScreenshot(r.Context(), id)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	w.Header().Set("Content-Type", shot.ContentType)
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	http.ServeFile(w, r, s.store.BlobPath(shot))
}

func (s *Server) updateAnnotations(w http.ResponseWriter, r *http.Request, id string) {
	defer r.Body.Close()
	var req updateAnnotationsRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("decode request: %w", err))
		return
	}
	if len(req.Annotations) == 0 {
		writeError(w, http.StatusBadRequest, errors.New("annotations is required"))
		return
	}
	shot, err := s.store.UpdateAnnotations(r.Context(), id, req.Annotations)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"screenshot": s.toDTO(shot)})
}

func (s *Server) handleApp(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		http.Redirect(w, r, "/screenshot", http.StatusFound)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}

	if served := s.tryServeStatic(w, r); served {
		return
	}

	if r.URL.Path == "/screenshot" || strings.HasPrefix(r.URL.Path, "/screenshot/") {
		index := filepath.Join(s.staticDir, "index.html")
		if _, err := os.Stat(index); err == nil {
			http.ServeFile(w, r, index)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`<html><body><h1>Panda Screenshot</h1><p>Run <code>npm --prefix web run build</code> before opening the app.</p></body></html>`))
		return
	}
	writeError(w, http.StatusNotFound, errors.New("not found"))
}

func (s *Server) tryServeStatic(w http.ResponseWriter, r *http.Request) bool {
	if s.staticDir == "" {
		return false
	}
	clean := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
	if clean == "." || strings.HasPrefix(clean, "..") {
		return false
	}
	path := filepath.Join(s.staticDir, clean)
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	http.ServeFile(w, r, path)
	return true
}

func (s *Server) toDTO(shot store.Screenshot) screenshotDTO {
	return screenshotDTO{
		Screenshot: shot,
		ImageURL:    "/api/screenshots/" + shot.ID + "/image",
		PageURL:     "/screenshot/" + shot.ID,
	}
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Max-Age", "600")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func decodeImageData(value string) ([]byte, string, error) {
	contentType := "image/png"
	payload := value
	if strings.HasPrefix(value, "data:") {
		header, rest, ok := strings.Cut(value, ",")
		if !ok {
			return nil, "", errors.New("invalid data URL")
		}
		if !strings.Contains(header, ";base64") {
			return nil, "", errors.New("imageData data URL must be base64 encoded")
		}
		payload = rest
		media := strings.TrimPrefix(strings.Split(header, ";")[0], "data:")
		if media != "" {
			contentType = media
		}
	}
	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, "", fmt.Errorf("decode imageData: %w", err)
	}
	if len(decoded) == 0 {
		return nil, "", errors.New("imageData is empty")
	}
	if !strings.HasPrefix(contentType, "image/") {
		contentType = http.DetectContentType(decoded)
	}
	return decoded, contentType, nil
}

func newID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw[:]), nil
}

func writeStoreError(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeError(w, http.StatusInternalServerError, err)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{
			"message": err.Error(),
			"status":  status,
			"time":    time.Now().UTC().Format(time.RFC3339),
		},
	})
}

func WithTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, 10*time.Second)
}

