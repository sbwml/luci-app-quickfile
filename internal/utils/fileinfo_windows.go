//go:build windows
// +build windows

package utils

import (
	"os"
	"syscall"
	"time"
)

func GetFileOwnerGroup(fi os.FileInfo) (string, string) {
	// On Windows, we don't attempt to fetch owner/group info
	return "N/A", "N/A"
}

func getBirthTime(fi os.FileInfo) string {
	if stat, ok := fi.Sys().(*syscall.Win32FileAttributeData); ok {
		return time.Unix(0, stat.CreationTime.Nanoseconds()).Format("2006/01/02 15:04:05")
	}
	return "N/A"
}
