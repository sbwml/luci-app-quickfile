package api

import (
	"crypto/md5"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"hash"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"git.cooluc.com/sbwml/quickfile/internal/config"
)

func respondJSON(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

// 路径补全
func autocompleteHandler(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")

	path = filepath.FromSlash(path)

	var dir, prefix string
	if strings.HasSuffix(path, string(os.PathSeparator)) {
		dir = path
		prefix = ""
	} else {
		dir = filepath.Dir(path)
		prefix = filepath.Base(path)
		if dir == "." && !strings.Contains(path, string(os.PathSeparator)) {
			dir = ""
		}
	}

	fullDir := filepath.Join(config.WorkDir, dir)

	absWorkDir, _ := filepath.Abs(config.WorkDir)
	absFullDir, _ := filepath.Abs(fullDir)
	if !strings.HasPrefix(absFullDir, absWorkDir) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]string{})
		return
	}

	entries, err := os.ReadDir(fullDir)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]string{})
		return
	}

	var suggestions []string
	for _, entry := range entries {
		if len(suggestions) >= 50 {
			break
		}

		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(strings.ToLower(name), strings.ToLower(prefix)) {

			fullPath := filepath.ToSlash(filepath.Join("/", dir, name))
			if !strings.HasSuffix(fullPath, "/") {
				fullPath += "/"
			}
			suggestions = append(suggestions, fullPath)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(suggestions)
}

type PropertyResponse struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	IsDir     bool   `json:"is_dir"`
	Size      int64  `json:"size"`
	ModTime   string `json:"mod_time"`
	BirthTime string `json:"birth_time"`
	Files     int    `json:"files,omitempty"`
	Folders   int    `json:"folders,omitempty"`
	Type      string `json:"type,omitempty"`
}

func propertiesHandler(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	fullPath := filepath.Join(config.WorkDir, path)

	absWorkDir, _ := filepath.Abs(config.WorkDir)
	absFullPath, _ := filepath.Abs(fullPath)
	if !strings.HasPrefix(absFullPath, absWorkDir) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	info, err := os.Lstat(fullPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp := PropertyResponse{
		Name:    info.Name(),
		Path:    filepath.ToSlash(filepath.Join("/", path)),
		IsDir:   info.IsDir(),
		ModTime: info.ModTime().Format("2006/01/02 15:04:05"),
	}

	if !info.IsDir() {
		resp.Size = info.Size()
		resp.Type = filepath.Ext(info.Name())
		if resp.Type == "" {
			resp.Type = "file"
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func propertiesStreamHandler(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	fullPath := filepath.Join(config.WorkDir, path)

	absWorkDir, _ := filepath.Abs(config.WorkDir)
	absFullPath, _ := filepath.Abs(fullPath)
	if !strings.HasPrefix(absFullPath, absWorkDir) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ctx := r.Context()
	var totalSize int64
	var fileCount, folderCount int
	var mu sync.Mutex

	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	done := make(chan bool)
	go func() {
		filepath.WalkDir(fullPath, func(p string, d fs.DirEntry, err error) error {
			select {
			case <-ctx.Done():
				return filepath.SkipAll
			default:
			}

			if err != nil {
				return nil
			}
			mu.Lock()
			if d.IsDir() {
				if p != fullPath {
					folderCount++
				}
			} else {
				fileCount++
				fi, err := d.Info()
				if err == nil {
					totalSize += fi.Size()
				}
			}
			mu.Unlock()
			return nil
		})
		done <- true
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case <-done:
			mu.Lock()
			fmt.Fprintf(w, "data: %s\n\n", fmt.Sprintf(`{"size":%d,"files":%d,"folders":%d,"done":true}`, totalSize, fileCount, folderCount))
			mu.Unlock()
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
			return
		case <-ticker.C:
			mu.Lock()
			fmt.Fprintf(w, "data: %s\n\n", fmt.Sprintf(`{"size":%d,"files":%d,"folders":%d,"done":false}`, totalSize, fileCount, folderCount))
			mu.Unlock()
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
	}
}

func hashHandler(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	algo := r.URL.Query().Get("algo")
	fullPath := filepath.Join(config.WorkDir, path)

	absWorkDir, _ := filepath.Abs(config.WorkDir)
	absFullPath, _ := filepath.Abs(fullPath)
	if !strings.HasPrefix(absFullPath, absWorkDir) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	f, err := os.Open(fullPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer f.Close()

	var h hash.Hash
	if algo == "md5" {
		h = md5.New()
	} else {
		h = sha256.New()
	}

	buf := make([]byte, 32*1024)
	for {
		select {
		case <-r.Context().Done():
			return
		default:
		}
		n, err := f.Read(buf)
		if n > 0 {
			h.Write(buf[:n])
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"hash": fmt.Sprintf("%x", h.Sum(nil)),
	})
}
