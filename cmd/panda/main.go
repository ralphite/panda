package main

import (
	"context"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"panda"
	"panda/internal/server"
	"panda/internal/store"
)

// listenAddr is fixed: the bundled Chrome extension targets localhost:8088.
const listenAddr = ":8088"

func main() {
	dataFlag := flag.String("data", "", "data directory (default ~/.panda, or %LocalAppData%\\Panda on Windows)")
	webDir := flag.String("web", "", "serve the frontend from this directory instead of the embedded build (dev mode)")
	exportExt := flag.String("export-extension", "", "write the bundled Chrome extension to this directory and exit")
	flag.Parse()

	if *exportExt != "" {
		if err := panda.WriteExtension(*exportExt); err != nil {
			log.Fatalf("export extension: %v", err)
		}
		return
	}

	dataDir, err := resolveDataDir(*dataFlag)
	if err != nil {
		log.Fatalf("resolve data directory: %v", err)
	}

	static, err := resolveStatic(*webDir)
	if err != nil {
		log.Fatalf("load frontend assets: %v", err)
	}

	st, err := store.Open(context.Background(), dataDir)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	srv := server.New(st, static)
	log.Printf("panda listening on %s (data: %s)", listenAddr, dataDir)
	if err := http.ListenAndServe(listenAddr, srv.Handler()); err != nil {
		log.Fatalf("serve: %v", err)
	}
}

// resolveStatic returns the frontend asset filesystem: a directory on disk when
// -web is given (dev mode), otherwise the build embedded in the binary.
func resolveStatic(webDir string) (fs.FS, error) {
	if webDir != "" {
		return os.DirFS(webDir), nil
	}
	return panda.WebUI()
}

// resolveDataDir picks the data directory: the -data flag wins, then the
// PANDA_DATA environment variable, then the per-OS default.
func resolveDataDir(flagVal string) (string, error) {
	if flagVal != "" {
		return expandHome(flagVal)
	}
	if env := os.Getenv("PANDA_DATA"); env != "" {
		return expandHome(env)
	}
	return defaultDataDir()
}

func defaultDataDir() (string, error) {
	if runtime.GOOS == "windows" {
		if dir := os.Getenv("LocalAppData"); dir != "" {
			return filepath.Join(dir, "Panda"), nil
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".panda"), nil
}

func expandHome(p string) (string, error) {
	if p != "~" && !strings.HasPrefix(p, "~/") {
		return p, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	if p == "~" {
		return home, nil
	}
	return filepath.Join(home, p[2:]), nil
}
