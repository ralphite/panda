// Package panda embeds the web frontend and the Chrome extension into the
// binary so it ships as a single self-contained artifact.
package panda

import (
	"embed"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

//go:embed all:web/dist
var webDist embed.FS

//go:embed all:extension
var extensionFS embed.FS

// WebUI returns the embedded production web build, rooted at its top level.
// Run `npm --prefix web run build` before compiling, or the embed fails.
func WebUI() (fs.FS, error) {
	return fs.Sub(webDist, "web/dist")
}

// WriteExtension materializes the bundled Chrome extension into dir, skipping
// test files so the result loads cleanly as an unpacked extension.
func WriteExtension(dir string) error {
	sub, err := fs.Sub(extensionFS, "extension")
	if err != nil {
		return err
	}
	return fs.WalkDir(sub, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		target := filepath.Join(dir, filepath.FromSlash(p))
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if strings.Contains(d.Name(), ".test.") {
			return nil
		}
		data, err := fs.ReadFile(sub, p)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o644)
	})
}
