package config

var (
	WorkDir      string
	AuthUser     string
	AuthPass     string
	Port         string
	SockPath     string
	ApiPrefix    string
	StaticPrefix string
	NoAuth       bool
	Version      = "v1.0.24"
	Locales      = make(map[string]map[string]string)
)
