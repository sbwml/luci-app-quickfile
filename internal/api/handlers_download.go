package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"git.cooluc.com/sbwml/quickfile/internal/config"
)

type DownloadProgress struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Total    int64  `json:"total"`
	Current  int64  `json:"current"`
	Done     bool   `json:"done"`
	Error    string `json:"error,omitempty"`
	cancel   context.CancelFunc
}

func downloadURLHandler(w http.ResponseWriter, r *http.Request) {
	url := r.FormValue("url")
	filename := r.FormValue("filename")
	dir := r.FormValue("dir")
	if url == "" || filename == "" {
		http.Error(w, "missing url or filename", http.StatusBadRequest)
		return
	}
	if dir == "" {
		dir = "."
	}
	ctx, cancel := context.WithCancel(context.Background())
	go startDownload(ctx, url, filename, dir, cancel)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"filename": filename,
	})
}

func cancelDownloadHandler(w http.ResponseWriter, r *http.Request) {
	filename := r.FormValue("filename")
	if filename == "" {
		http.Error(w, "missing filename", http.StatusBadRequest)
		return
	}
	downloadProgressMu.Lock()
	progress, ok := downloadProgressMap[filename]
	downloadProgressMu.Unlock()
	if ok && progress.cancel != nil {
		progress.cancel()
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func getNonConflictFilename(dir, filename string) string {
	base := filename
	ext := ""
	if dot := strings.LastIndex(filename, "."); dot != -1 {
		base = filename[:dot]
		ext = filename[dot:]
	}
	newName := filename
	count := 1
	for {
		fullPath := filepath.Join(dir, newName)
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			return newName
		}
		newName = fmt.Sprintf("%s (%d)%s", base, count, ext)
		count++
	}
}

func startDownload(ctx context.Context, url, filename, dir string, cancel context.CancelFunc) {
	progress := &DownloadProgress{
		URL:      url,
		Filename: filename,
		cancel:   cancel,
	}
	downloadProgressMu.Lock()
	downloadProgressMap[filename] = progress
	downloadProgressMu.Unlock()

	defer func() {
		progress.Done = true
		downloadProgressMu.Lock()
		delete(downloadProgressMap, filename)
		downloadProgressMu.Unlock()
	}()

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		progress.Error = err.Error()
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		progress.Error = err.Error()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		progress.Error = fmt.Sprintf("http error: %s", resp.Status)
		return
	}

	progress.Total = resp.ContentLength
	outDir := filepath.Join(config.WorkDir, dir)
	if err := os.MkdirAll(outDir, 0755); err != nil {
		progress.Error = err.Error()
		return
	}

	finalName := getNonConflictFilename(outDir, filename)
	progress.Filename = finalName
	outPath := filepath.Join(outDir, finalName)
	out, err := os.Create(outPath)
	if err != nil {
		progress.Error = err.Error()
		return
	}
	defer out.Close()

	buf := make([]byte, 32*1024)
	for {
		select {
		case <-ctx.Done():
			progress.Error = "download canceled"
			return
		default:
		}
		n, err := resp.Body.Read(buf)
		if n > 0 {
			written, werr := out.Write(buf[:n])
			if werr != nil {
				progress.Error = werr.Error()
				return
			}
			progress.Current += int64(written)
			downloadProgressMu.Lock()
			downloadProgressMap[progress.Filename] = progress
			downloadProgressMu.Unlock()
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			progress.Done = true
			return
		}
	}
}

func downloadProgressHandler(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("filename")
	if filename == "" {
		http.Error(w, "missing filename", http.StatusBadRequest)
		return
	}
	downloadProgressMu.Lock()
	progress, ok := downloadProgressMap[filename]
	downloadProgressMu.Unlock()
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(progress)
}
