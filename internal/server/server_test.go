package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"panda/internal/store"
)

const oneByOnePNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

func TestCreateListGetAndUpdateScreenshot(t *testing.T) {
	st, err := store.Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	ts := httptest.NewServer(New(st, nil).Handler())
	t.Cleanup(ts.Close)

	createBody := map[string]any{
		"imageData": oneByOnePNG,
		"sourceUrl": "https://example.test",
		"pageTitle": "Example",
	}
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(createBody); err != nil {
		t.Fatal(err)
	}
	res, err := http.Post(ts.URL+"/api/screenshots", "application/json", &buf)
	if err != nil {
		t.Fatalf("post screenshot: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", res.StatusCode)
	}
	var created createScreenshotResponse
	if err := json.NewDecoder(res.Body).Decode(&created); err != nil {
		t.Fatalf("decode create: %v", err)
	}
	if created.Screenshot.Width != 1 || created.Screenshot.Height != 1 {
		t.Fatalf("dimensions = %dx%d, want 1x1", created.Screenshot.Width, created.Screenshot.Height)
	}

	listRes, err := http.Get(ts.URL + "/api/screenshots")
	if err != nil {
		t.Fatalf("list screenshots: %v", err)
	}
	defer listRes.Body.Close()
	var listed struct {
		Screenshots []screenshotDTO `json:"screenshots"`
	}
	if err := json.NewDecoder(listRes.Body).Decode(&listed); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(listed.Screenshots) != 1 {
		t.Fatalf("listed %d screenshots, want 1", len(listed.Screenshots))
	}

	update := updateAnnotationsRequest{Annotations: json.RawMessage(`[{"id":"a","type":"rect","x":1,"y":2,"w":3,"h":4}]`)}
	buf.Reset()
	if err := json.NewEncoder(&buf).Encode(update); err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPut, ts.URL+"/api/screenshots/"+created.Screenshot.ID+"/annotations", &buf)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	updateRes, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("update annotations: %v", err)
	}
	defer updateRes.Body.Close()
	if updateRes.StatusCode != http.StatusOK {
		t.Fatalf("update status = %d, want 200", updateRes.StatusCode)
	}
}

func TestServeScreenshotPNGPath(t *testing.T) {
	st, err := store.Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	ts := httptest.NewServer(New(st, nil).Handler())
	t.Cleanup(ts.Close)

	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(map[string]any{"imageData": oneByOnePNG}); err != nil {
		t.Fatal(err)
	}
	res, err := http.Post(ts.URL+"/api/screenshots", "application/json", &buf)
	if err != nil {
		t.Fatalf("post screenshot: %v", err)
	}
	defer res.Body.Close()
	var created createScreenshotResponse
	if err := json.NewDecoder(res.Body).Decode(&created); err != nil {
		t.Fatalf("decode create: %v", err)
	}

	imgRes, err := http.Get(ts.URL + "/screenshot/" + created.Screenshot.ID + ".png")
	if err != nil {
		t.Fatalf("get png: %v", err)
	}
	defer imgRes.Body.Close()
	if imgRes.StatusCode != http.StatusOK {
		t.Fatalf("png status = %d, want 200", imgRes.StatusCode)
	}
	if ct := imgRes.Header.Get("Content-Type"); ct != "image/png" {
		t.Fatalf("png content-type = %q, want image/png", ct)
	}
	body, err := io.ReadAll(imgRes.Body)
	if err != nil {
		t.Fatalf("read png body: %v", err)
	}
	if len(body) == 0 {
		t.Fatal("png body is empty")
	}

	missing, err := http.Get(ts.URL + "/screenshot/does-not-exist.png")
	if err != nil {
		t.Fatalf("get missing png: %v", err)
	}
	defer missing.Body.Close()
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("missing png status = %d, want 404", missing.StatusCode)
	}
}
