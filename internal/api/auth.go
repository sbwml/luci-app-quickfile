package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"git.cooluc.com/sbwml/quickfile/internal/config"
)

func basicAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if config.AuthUser == "" && config.AuthPass == "" {
			next.ServeHTTP(w, r)
			return
		}
		user, pass, ok := r.BasicAuth()
		if !ok || user != config.AuthUser || pass != config.AuthPass {
			w.Header().Set("WWW-Authenticate", `Basic realm="Restricted"`)
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte("Unauthorized"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func validateLuCISession(authURL, sessionID string) (bool, error) {
	req, err := http.NewRequest("POST", authURL, nil)
	if err != nil {
		return false, err
	}
	req.AddCookie(&http.Cookie{Name: "sysauth_http", Value: sessionID})

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK, nil
}

func luciAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		host := r.URL.Query().Get("host")
		if host == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "invalid host",
			})
			return
		}
		authURL := host + "/cgi-bin/luci"

		cookie, err := r.Cookie("sysauth_http")
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "invalid session",
			})
			return
		}

		ok, err := validateLuCISession(authURL, cookie.Value)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("Session verification failed: %v", err),
			})
			return
		}
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Invalid or expired session token.",
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}
