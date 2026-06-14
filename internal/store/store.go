package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

var ErrNotFound = errors.New("screenshot not found")

type Screenshot struct {
	ID          string          `json:"id"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
	SourceURL   string          `json:"sourceUrl"`
	PageTitle   string          `json:"pageTitle"`
	Filename    string          `json:"filename"`
	ContentType string          `json:"contentType"`
	Width       int             `json:"width"`
	Height      int             `json:"height"`
	SizeBytes   int64           `json:"sizeBytes"`
	Annotations json.RawMessage `json:"annotations"`
}

type CreateInput struct {
	ID          string
	Image      []byte
	ContentType string
	SourceURL   string
	PageTitle   string
	Width       int
	Height      int
	Annotations json.RawMessage
}

type Store struct {
	db      *sql.DB
	dataDir string
	blobDir string
}

func Open(ctx context.Context, dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, err
	}
	blobDir := filepath.Join(dataDir, "blobs")
	if err := os.MkdirAll(blobDir, 0o755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", filepath.Join(dataDir, "panda.db"))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)

	st := &Store{db: db, dataDir: dataDir, blobDir: blobDir}
	if err := st.migrate(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return st, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) BlobPath(shot Screenshot) string {
	return filepath.Join(s.blobDir, shot.Filename)
}

func (s *Store) migrate(ctx context.Context) error {
	statements := []string{
		`PRAGMA journal_mode = WAL;`,
		`PRAGMA foreign_keys = ON;`,
		`CREATE TABLE IF NOT EXISTS screenshots (
			id TEXT PRIMARY KEY,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			source_url TEXT NOT NULL DEFAULT '',
			page_title TEXT NOT NULL DEFAULT '',
			filename TEXT NOT NULL,
			content_type TEXT NOT NULL,
			width INTEGER NOT NULL,
			height INTEGER NOT NULL,
			size_bytes INTEGER NOT NULL,
			annotations TEXT NOT NULL DEFAULT '[]'
		);`,
		`CREATE INDEX IF NOT EXISTS idx_screenshots_created_at ON screenshots(created_at DESC);`,
	}
	for _, stmt := range statements {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) CreateScreenshot(ctx context.Context, input CreateInput) (Screenshot, error) {
	if input.ID == "" {
		return Screenshot{}, errors.New("id is required")
	}
	if len(input.Image) == 0 {
		return Screenshot{}, errors.New("image is required")
	}
	if !json.Valid(defaultAnnotations(input.Annotations)) {
		return Screenshot{}, errors.New("annotations must be valid JSON")
	}

	filename := input.ID + ".png"
	path := filepath.Join(s.blobDir, filename)
	if err := os.WriteFile(path, input.Image, 0o600); err != nil {
		return Screenshot{}, err
	}

	now := time.Now().UTC()
	shot := Screenshot{
		ID:          input.ID,
		CreatedAt:   now,
		UpdatedAt:   now,
		SourceURL:   input.SourceURL,
		PageTitle:   input.PageTitle,
		Filename:    filename,
		ContentType: input.ContentType,
		Width:       input.Width,
		Height:      input.Height,
		SizeBytes:   int64(len(input.Image)),
		Annotations: defaultAnnotations(input.Annotations),
	}

	_, err := s.db.ExecContext(ctx, `INSERT INTO screenshots
		(id, created_at, updated_at, source_url, page_title, filename, content_type, width, height, size_bytes, annotations)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		shot.ID, formatTime(shot.CreatedAt), formatTime(shot.UpdatedAt), shot.SourceURL, shot.PageTitle,
		shot.Filename, shot.ContentType, shot.Width, shot.Height, shot.SizeBytes, string(shot.Annotations),
	)
	if err != nil {
		_ = os.Remove(path)
		return Screenshot{}, err
	}
	return shot, nil
}

func (s *Store) ListScreenshots(ctx context.Context, limit int) ([]Screenshot, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, created_at, updated_at, source_url, page_title,
		filename, content_type, width, height, size_bytes, annotations
		FROM screenshots ORDER BY created_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shots []Screenshot
	for rows.Next() {
		shot, err := scanScreenshot(rows)
		if err != nil {
			return nil, err
		}
		shots = append(shots, shot)
	}
	return shots, rows.Err()
}

func (s *Store) GetScreenshot(ctx context.Context, id string) (Screenshot, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, created_at, updated_at, source_url, page_title,
		filename, content_type, width, height, size_bytes, annotations
		FROM screenshots WHERE id = ?`, id)
	shot, err := scanScreenshot(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Screenshot{}, ErrNotFound
	}
	return shot, err
}

func (s *Store) UpdateAnnotations(ctx context.Context, id string, annotations json.RawMessage) (Screenshot, error) {
	if !json.Valid(annotations) {
		return Screenshot{}, errors.New("annotations must be valid JSON")
	}
	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx, `UPDATE screenshots SET annotations = ?, updated_at = ? WHERE id = ?`,
		string(annotations), formatTime(now), id)
	if err != nil {
		return Screenshot{}, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return Screenshot{}, err
	}
	if affected == 0 {
		return Screenshot{}, ErrNotFound
	}
	return s.GetScreenshot(ctx, id)
}

type scanner interface {
	Scan(dest ...any) error
}

func scanScreenshot(row scanner) (Screenshot, error) {
	var shot Screenshot
	var createdAt, updatedAt, annotations string
	err := row.Scan(&shot.ID, &createdAt, &updatedAt, &shot.SourceURL, &shot.PageTitle,
		&shot.Filename, &shot.ContentType, &shot.Width, &shot.Height, &shot.SizeBytes, &annotations)
	if err != nil {
		return Screenshot{}, err
	}
	shot.CreatedAt, err = parseTime(createdAt)
	if err != nil {
		return Screenshot{}, err
	}
	shot.UpdatedAt, err = parseTime(updatedAt)
	if err != nil {
		return Screenshot{}, err
	}
	shot.Annotations = json.RawMessage(annotations)
	return shot, nil
}

func defaultAnnotations(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return json.RawMessage("[]")
	}
	return raw
}

func formatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}

func parseTime(value string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse sqlite time %q: %w", value, err)
	}
	return t, nil
}

