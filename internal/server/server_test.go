package server

import (
	"bytes"
	"context"
	"encoding/json"
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
	ts := httptest.NewServer(New(st, "").Handler())
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

