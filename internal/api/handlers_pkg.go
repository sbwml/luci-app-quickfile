package api

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"git.cooluc.com/sbwml/quickfile/internal/config"
)

func installIpkHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	if dir == "" {
		dir = "."
	}
	name := r.FormValue("name")
	if name == "" {
		http.Error(w, "No ipk filename", http.StatusBadRequest)
		return
	}
	ipkPath := filepath.Join(config.WorkDir, dir, name)
	if _, err := os.Stat(ipkPath); err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	cmd := exec.Command("/bin/opkg", "install", "--force-downgrade", ipkPath)
	output, err := cmd.CombinedOutput()
	success := (err == nil)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": success,
		"log":     string(output),
		"error": func() string {
			if err != nil {
				return err.Error()
			}
			return ""
		}(),
	})
}

func installApkHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	if dir == "" {
		dir = "."
	}
	name := r.FormValue("name")
	if name == "" {
		http.Error(w, "No apk filename", http.StatusBadRequest)
		return
	}
	apkPath := filepath.Join(config.WorkDir, dir, name)
	if _, err := os.Stat(apkPath); err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	cmd := exec.Command("/usr/bin/apk", "add", "--allow-untrusted", apkPath)
	output, err := cmd.CombinedOutput()
	success := (err == nil)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": success,
		"log":     string(output),
		"error": func() string {
			if err != nil {
				return err.Error()
			}
			return ""
		}(),
	})
}

func opkgUpdateHandler(w http.ResponseWriter, r *http.Request) {
	cmd := exec.Command("opkg", "update")
	output, err := cmd.CombinedOutput()
	success := (err == nil)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": success,
		"log":     string(output),
		"error": func() string {
			if err != nil {
				return err.Error()
			}
			return ""
		}(),
	})
}

func apkUpdateHandler(w http.ResponseWriter, r *http.Request) {
	cmd := exec.Command("apk", "update")
	output, err := cmd.CombinedOutput()
	success := (err == nil)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": success,
		"log":     string(output),
		"error": func() string {
			if err != nil {
				return err.Error()
			}
			return ""
		}(),
	})
}
