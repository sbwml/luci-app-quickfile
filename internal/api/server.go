package api

import (
	"encoding/json"
	"fmt"

	"git.cooluc.com/sbwml/quickfile/internal/config"
	"git.cooluc.com/sbwml/quickfile/public"

	_ "image/gif"

	_ "image/png"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"text/template"
)

func loadLocales() {
	files, _ := public.I18nFiles.ReadDir("i18n")
	for _, f := range files {
		name := f.Name()
		lang := strings.TrimSuffix(name, ".json")
		content, _ := public.I18nFiles.ReadFile("i18n/" + name)
		var m map[string]string
		json.Unmarshal(content, &m)
		config.Locales[lang] = m
	}
}

var (
	downloadProgressMap = make(map[string]*DownloadProgress)
	downloadProgressMu  sync.Mutex
)

func StartServer() {

	loadLocales()

	mux := http.NewServeMux()
	staticFS, _ := fs.Sub(public.StaticFiles, "static")

	if !strings.HasSuffix(config.StaticPrefix, "/") {
		config.StaticPrefix += "/"
	}
	if !strings.HasSuffix(config.ApiPrefix, "/") {
		config.ApiPrefix += "/"
	}

	fileServer := http.StripPrefix("/static/", http.FileServer(http.FS(staticFS)))
	mux.Handle("/static/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".html") || strings.HasSuffix(r.URL.Path, "dark.css") || strings.HasSuffix(r.URL.Path, "quickfile.js") {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		} else {
			w.Header().Set("Cache-Control", "public, max-age=15552000")
		}
		fileServer.ServeHTTP(w, r)
	}))
	mux.HandleFunc("/", dashboardHandler)
	mux.HandleFunc("/api/upload", uploadHandler)
	mux.HandleFunc("/api/list", listHandler)
	mux.HandleFunc("/api/delete", deleteHandler)
	mux.HandleFunc("/api/rename", renameHandler)
	mux.HandleFunc("/api/download", downloadHandler)
	mux.HandleFunc("/api/thumbnail", thumbnailHandler)
	mux.HandleFunc("/api/mkdir", mkdirHandler)
	mux.HandleFunc("/api/createfile", createFileHandler)
	mux.HandleFunc("/api/rmdir", rmdirHandler)
	mux.HandleFunc("/api/renamedir", renamedirHandler)
	mux.HandleFunc("/api/readfile", readFileHandler)
	mux.HandleFunc("/api/writefile", writeFileHandler)
	mux.HandleFunc("/api/chmod", chmodHandler)
	mux.HandleFunc("/api/chown", chownHandler)
	mux.HandleFunc("/api/delete_batch", deleteBatchHandler)
	mux.HandleFunc("/api/copy", copyHandler)
	mux.HandleFunc("/api/move", moveHandler)
	mux.HandleFunc("/api/install_ipk", installIpkHandler)
	mux.HandleFunc("/api/install_apk", installApkHandler)
	mux.HandleFunc("/api/opkg_update", opkgUpdateHandler)
	mux.HandleFunc("/api/apk_update", apkUpdateHandler)
	mux.HandleFunc("/api/download_url", downloadURLHandler)
	mux.HandleFunc("/api/download_progress", downloadProgressHandler)
	mux.HandleFunc("/api/cancel_download", cancelDownloadHandler)
	mux.HandleFunc("/api/compress", compressHandler)
	mux.HandleFunc("/api/decompress", decompressHandler)
	mux.HandleFunc("/api/terminal", terminalHandler)
	mux.HandleFunc("/api/autocomplete", autocompleteHandler)
	mux.HandleFunc("/api/properties", propertiesHandler)
	mux.HandleFunc("/api/properties_stream", propertiesStreamHandler)
	mux.HandleFunc("/api/hash", hashHandler)

	// Check if authentication is disabled or basic auth is enabled
	var r http.Handler
	if config.NoAuth {
		r = mux
	} else if config.AuthUser != "" && config.AuthPass != "" {
		r = basicAuth(mux)
	} else {
		r = luciAuthMiddleware(mux)
	}

	if config.SockPath != "" {
		sockDir := filepath.Dir(config.SockPath)
		if err := os.MkdirAll(sockDir, 0755); err != nil {
			log.Fatalf("failed to create socket dir: %v", err)
		}
		os.Remove(config.SockPath)
		listener, err := net.Listen("unix", config.SockPath)
		if err != nil {
			log.Fatalf("failed to listen on unix socket: %v", err)
		}
		defer os.Remove(config.SockPath)
		c := make(chan os.Signal, 1)
		signal.Notify(c, syscall.SIGINT, syscall.SIGTERM)
		go func() {
			<-c
			os.Remove(config.SockPath)
			os.Exit(0)
		}()
		fmt.Printf("Server started:\n- Listen on unix socket: %s\n- Working directory: %s\n", config.SockPath, config.WorkDir)
		if config.NoAuth {
			fmt.Println("- Authentication: Disabled")
		}
		log.Fatal(http.Serve(listener, r))
	} else {
		fmt.Printf("Server started:\n- Listen on config.Port: %s\n- Working directory: %s\n", config.Port, config.WorkDir)
		if config.NoAuth {
			fmt.Println("- Authentication: Disabled")
		}
		log.Fatal(http.ListenAndServe(":"+config.Port, r))
	}
}

func getLanguage(r *http.Request) string {
	if lang := r.URL.Query().Get("lang"); lang != "" {
		if _, ok := config.Locales[lang]; ok {
			return lang
		}
	}

	if cookie, err := r.Cookie("lang"); err == nil {
		if _, ok := config.Locales[cookie.Value]; ok {
			return cookie.Value
		}
	}

	accept := r.Header.Get("Accept-Language")
	tags := strings.Split(accept, ",")
	for _, tag := range tags {
		lang := strings.Split(tag, ";")[0]
		lang = strings.TrimSpace(lang)
		if _, ok := config.Locales[lang]; ok {
			return lang
		}

		if strings.HasPrefix(lang, "zh") {
			if strings.Contains(strings.ToLower(lang), "tw") || strings.Contains(strings.ToLower(lang), "hk") {
				return "zh-TW"
			}
			return "zh-CN"
		}
		if strings.HasPrefix(lang, "en") {
			return "en"
		}
	}

	return "en"
}

func dashboardHandler(w http.ResponseWriter, r *http.Request) {
	tmplContent, err := public.StaticFiles.ReadFile("static/dashboard.html")
	if err != nil {
		http.Error(w, "dashboard.html not found", http.StatusInternalServerError)
		return
	}

	lang := getLanguage(r)
	translations := config.Locales[lang]

	tmpl, err := template.New("dashboard").Funcs(template.FuncMap{
		"T": func(key string) string {
			if val, ok := translations[key]; ok {
				return val
			}
			return key
		},
		"json": func(v interface{}) string {
			b, _ := json.Marshal(v)
			return string(b)
		},
	}).Parse(string(tmplContent))
	if err != nil {
		http.Error(w, "Failed to parse template", http.StatusInternalServerError)
		return
	}

	data := map[string]interface{}{
		"ApiPrefix":    config.ApiPrefix,
		"StaticPrefix": config.StaticPrefix,
		"Lang":         lang,
		"I18n":         translations,
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	err = tmpl.Execute(w, data)
	if err != nil {
		log.Printf("Failed to execute template: %v", err)
	}
}
