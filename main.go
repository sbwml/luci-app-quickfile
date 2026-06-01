package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"git.cooluc.com/sbwml/quickfile/internal/api"
	"git.cooluc.com/sbwml/quickfile/internal/config"
)

func main() {
	var showVer bool

	flag.StringVar(&config.WorkDir, "dir", "/", "Working directory for file browser")
	flag.StringVar(&config.Port, "port", "8080", "Port to listen on (default is 8080 if not using socket)")
	flag.StringVar(&config.SockPath, "sock", "", "Listen on unix socket file (leave empty to use port)")
	flag.StringVar(&config.AuthUser, "user", "", "Username for basic authentication")
	flag.StringVar(&config.AuthPass, "pass", "", "Password for basic authentication")
	flag.StringVar(&config.ApiPrefix, "api", "/api/", "API prefix")
	flag.StringVar(&config.StaticPrefix, "static", "/static/", "Static files prefix")
	flag.BoolVar(&config.NoAuth, "noauth", false, "Disable authentication")
	flag.BoolVar(&showVer, "v", false, "Print version")
	flag.Parse()

	if (config.AuthUser != "" && config.AuthPass == "") || (config.AuthUser == "" && config.AuthPass != "") {
		fmt.Println("Error: both -user and -pass are required to enable basic authentication.")
		return
	}

	if showVer {
		fmt.Println(config.Version)
		return
	}

	if err := os.MkdirAll(config.WorkDir, 0755); err != nil {
		log.Fatalf("failed to create work dir: %v", err)
	}

	api.StartServer()
}
