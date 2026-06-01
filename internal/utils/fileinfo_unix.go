//go:build !windows
// +build !windows

package utils

import (
	"os"
	"os/user"
	"strconv"
	"syscall"
)

func GetFileOwnerGroup(fi os.FileInfo) (string, string) {
	var owner, group string
	if stat, ok := fi.Sys().(*syscall.Stat_t); ok {
		owner = strconv.FormatUint(uint64(stat.Uid), 10)
		group = strconv.FormatUint(uint64(stat.Gid), 10)

		if userInfo, err := user.LookupId(owner); err == nil {
			owner = userInfo.Username
		}
		if groupInfo, err := user.LookupGroupId(group); err == nil {
			group = groupInfo.Name
		}
	}
	return owner, group
}

func getBirthTime(fi os.FileInfo) string {
	return "N/A" // Linux creation time is complex to get via standard syscalls
}
