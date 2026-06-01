package public

import "embed"

//go:embed i18n/*.json
var I18nFiles embed.FS

//go:embed static/*
var StaticFiles embed.FS
