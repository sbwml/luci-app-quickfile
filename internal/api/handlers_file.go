package api

import (
	"bytes"
	"encoding/json"
	"image"
	"image/jpeg"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/user"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"git.cooluc.com/sbwml/quickfile/internal/config"
	"git.cooluc.com/sbwml/quickfile/internal/utils"
	"golang.org/x/image/draw"
)

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.Header.Get("X-Upload-Dir")
	filename := r.Header.Get("X-Upload-Filename")

	var err error
	dir, err = url.QueryUnescape(dir)
	if err != nil || dir == "" {
		dir = "."
	}

	filename, err = url.QueryUnescape(filename)
	if err != nil || filename == "" {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	saveDir := filepath.Join(config.WorkDir, dir)
	if err := os.MkdirAll(saveDir, 0755); err != nil {
		http.Error(w, "Failed to create dir", http.StatusInternalServerError)
		return
	}

	savePath := filepath.Join(saveDir, filename)
	out, err := os.Create(savePath)
	if err != nil {
		http.Error(w, "Failed to create file", http.StatusInternalServerError)
		return
	}
	defer out.Close()

	buf := make([]byte, 1024*1024)
	written, err := io.CopyBuffer(out, r.Body, buf)
	if err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"size":    written,
	})
}

type FileInfo struct {
	Name       string `json:"name"`
	Size       int64  `json:"size"`
	ModTime    int64  `json:"modtime"`
	IsDir      bool   `json:"isdir"`
	IsSymlink  bool   `json:"issymlink"`
	LinkTarget string `json:"linktarget,omitempty"`
	Mode       string `json:"mode,omitempty"`
	Owner      string `json:"owner,omitempty"`
	Group      string `json:"group,omitempty"`
}

func listHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		dir = "."
	}
	search := r.URL.Query().Get("search")
	showHidden := r.URL.Query().Get("showHidden") == "true"
	listPath := filepath.Join(config.WorkDir, dir)
	files, err := os.ReadDir(listPath)
	if err != nil {
		http.Error(w, "Failed to read dir", http.StatusInternalServerError)
		return
	}
	var list []FileInfo
	for _, f := range files {
		if !showHidden && strings.HasPrefix(f.Name(), ".") {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(f.Name()), strings.ToLower(search)) {
			continue
		}
		filePath := filepath.Join(listPath, f.Name())
		fi, err := os.Lstat(filePath)
		if err != nil {
			continue
		}
		isSymlink := fi.Mode()&os.ModeSymlink != 0
		linkTarget := ""
		isDir := fi.IsDir()
		if isSymlink {
			linkTarget, _ = os.Readlink(filePath)
			targetInfo, err := os.Stat(filePath)
			if err == nil && targetInfo.IsDir() {
				isDir = true
			} else {
				isDir = false
			}
		}

		mode := fi.Mode().Perm().String()
		if isDir {
			mode = "d" + mode[1:]
		}
		if isSymlink {
			mode = "l" + mode[1:]
		}

		owner, group := utils.GetFileOwnerGroup(fi)

		list = append(list, FileInfo{
			Name:       f.Name(),
			Size:       fi.Size(),
			ModTime:    fi.ModTime().Unix(),
			IsDir:      isDir,
			IsSymlink:  isSymlink,
			LinkTarget: linkTarget,
			Mode:       mode,
			Owner:      owner,
			Group:      group,
		})
	}

	sortFiles(list)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func sortFiles(files []FileInfo) {
	sort.Slice(files, func(i, j int) bool {
		if files[i].IsDir != files[j].IsDir {
			return files[i].IsDir
		}
		return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
	})
}

func deleteHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	if dir == "" {
		dir = "."
	}
	name := r.FormValue("name")
	if name == "" {
		http.Error(w, "No filename", http.StatusBadRequest)
		return
	}
	err := os.Remove(filepath.Join(config.WorkDir, dir, name))
	if err != nil {
		http.Error(w, "Failed to delete", http.StatusInternalServerError)
		return
	}
	w.Write([]byte(`{"success":true}`))
}

func deleteBatchHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	if dir == "" {
		dir = "."
	}
	names := r.Form["names[]"]
	if len(names) == 0 {
		names = r.Form["names"]
	}
	if len(names) == 0 {
		http.Error(w, "No filenames", http.StatusBadRequest)
		return
	}
	failed := make([]string, 0)
	for _, name := range names {
		err := os.RemoveAll(filepath.Join(config.WorkDir, dir, name))
		if err != nil {
			failed = append(failed, name)
		}
	}
	result := map[string]interface{}{
		"success": len(failed) == 0,
		"failed":  failed,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func renameHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	if dir == "" {
		dir = "."
	}
	from := r.FormValue("from")
	to := r.FormValue("to")
	if from == "" || to == "" {
		http.Error(w, "Invalid params", http.StatusBadRequest)
		return
	}
	err := os.Rename(filepath.Join(config.WorkDir, dir, from), filepath.Join(config.WorkDir, dir, to))
	if err != nil {
		http.Error(w, "Failed to rename", http.StatusInternalServerError)
		return
	}
	w.Write([]byte(`{"success":true}`))
}

func downloadHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		dir = "."
	}
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "No filename", http.StatusBadRequest)
		return
	}
	filePath := filepath.Join(config.WorkDir, dir, name)
	f, err := os.Open(filePath)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Disposition", "attachment; filename="+strconv.Quote(name))
	mimeType := mime.TypeByExtension(filepath.Ext(name))
	if mimeType != "" {
		w.Header().Set("Content-Type", mimeType)
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	http.ServeFile(w, r, filePath)
}

func thumbnailHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		dir = "."
	}
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "No filename", http.StatusBadRequest)
		return
	}
	filePath := filepath.Join(config.WorkDir, dir, name)
	file, err := os.Open(filePath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	if err != nil {
		ext := strings.ToLower(filepath.Ext(name))

		if ext == ".svg" || ext == ".webp" || ext == ".ico" || ext == ".avif" || ext == ".bmp" {
			file.Close()
			http.ServeFile(w, r, filePath)
			return
		}
		http.Error(w, "Failed to decode image", http.StatusInternalServerError)
		return
	}

	bounds := img.Bounds()
	origW, origH := bounds.Dx(), bounds.Dy()
	maxW, maxH := 128, 128

	var newW, newH int
	if origW <= maxW && origH <= maxH {
		newW, newH = origW, origH
	} else {
		ratioW := float64(maxW) / float64(origW)
		ratioH := float64(maxH) / float64(origH)
		ratio := ratioW
		if ratioH < ratioW {
			ratio = ratioH
		}
		newW = int(float64(origW) * ratio)
		newH = int(float64(origH) * ratio)
		if newW < 1 {
			newW = 1
		}
		if newH < 1 {
			newH = 1
		}
	}

	thumb := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.ApproxBiLinear.Scale(thumb, thumb.Bounds(), img, img.Bounds(), draw.Src, nil)

	buf := new(bytes.Buffer)
	if err := jpeg.Encode(buf, thumb, nil); err != nil {
		http.Error(w, "Failed to encode thumbnail", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Content-Length", strconv.Itoa(len(buf.Bytes())))
	if _, err := w.Write(buf.Bytes()); err != nil {
		return
	}
}

func mkdirHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	name := r.FormValue("name")
	if name == "" {
		http.Error(w, "No dirname", http.StatusBadRequest)
		return
	}
	fullPath := filepath.Join(config.WorkDir, dir, name)
	if err := os.Mkdir(fullPath, 0755); err != nil {
		http.Error(w, "Failed to create dir", http.StatusInternalServerError)
		return
	}
	w.Write([]byte(`{"success":true}`))
}

func createFileHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	if dir == "" {
		dir = "."
	}
	name := r.FormValue("name")
	if name == "" {
		http.Error(w, "No filename", http.StatusBadRequest)
		return
	}
	if name == "." || name == ".." || filepath.Base(name) != name {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}
	fullPath := filepath.Join(config.WorkDir, dir, name)
	if _, err := os.Stat(fullPath); err == nil {
		http.Error(w, "File already exists", http.StatusBadRequest)
		return
	}
	parentDir := filepath.Dir(fullPath)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		http.Error(w, "Failed to create parent dir", http.StatusInternalServerError)
		return
	}
	file, err := os.OpenFile(fullPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		http.Error(w, "Failed to create file", http.StatusInternalServerError)
		return
	}
	file.Close()
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

func rmdirHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	name := r.FormValue("name")
	if name == "" {
		http.Error(w, "No dirname", http.StatusBadRequest)
		return
	}
	fullPath := filepath.Join(config.WorkDir, dir, name)
	err := os.RemoveAll(fullPath)
	if err != nil {
		http.Error(w, "Failed to remove dir", http.StatusInternalServerError)
		return
	}
	w.Write([]byte(`{"success":true}`))
}

func renamedirHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	from := r.FormValue("from")
	to := r.FormValue("to")
	if from == "" || to == "" {
		http.Error(w, "Invalid params", http.StatusBadRequest)
		return
	}
	src := filepath.Join(config.WorkDir, dir, from)
	dst := filepath.Join(config.WorkDir, dir, to)
	if err := os.Rename(src, dst); err != nil {
		http.Error(w, "Failed to rename dir", http.StatusInternalServerError)
		return
	}
	w.Write([]byte(`{"success":true}`))
}

func readFileHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		dir = "."
	}
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "No filename", http.StatusBadRequest)
		return
	}
	filePath := filepath.Join(config.WorkDir, dir, name)
	fi, err := os.Stat(filePath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	if fi.Size() > 1024*1024 {
		http.Error(w, "File too large to edit", http.StatusForbidden)
		return
	}
	content, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, "Failed to read file", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"content": string(content),
	})
}

func writeFileHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	if dir == "" {
		dir = "."
	}
	name := r.FormValue("name")
	if name == "" {
		http.Error(w, "No filename", http.StatusBadRequest)
		return
	}
	filePath := filepath.Join(config.WorkDir, dir, name)
	fi, err := os.Stat(filePath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	if fi.Size() > 1024*1024 {
		http.Error(w, "File too large to edit", http.StatusForbidden)
		return
	}
	content := r.FormValue("content")
	err = os.WriteFile(filePath, []byte(content), 0644)
	if err != nil {
		http.Error(w, "Failed to write file", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

func chmodHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	if dir == "" {
		dir = "."
	}
	name := r.FormValue("name")
	modeStr := r.FormValue("mode")
	recursiveStr := r.FormValue("recursive")
	recursive := recursiveStr == "true"

	if name == "" || modeStr == "" {
		http.Error(w, "Missing parameter", http.StatusBadRequest)
		return
	}

	mode, err := strconv.ParseUint(modeStr, 8, 32)
	if err != nil {
		http.Error(w, "Invalid mode", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(config.WorkDir, dir, name)

	if recursive {
		err = filepath.Walk(filePath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			return os.Chmod(path, os.FileMode(mode))
		})
	} else {
		err = os.Chmod(filePath, os.FileMode(mode))
	}

	if err != nil {
		http.Error(w, "Failed to chmod: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"success":true}`))
}

func chownHandler(w http.ResponseWriter, r *http.Request) {
	dir := r.FormValue("dir")
	if dir == "" {
		dir = "."
	}
	name := r.FormValue("name")
	ownerStr := r.FormValue("owner")
	groupStr := r.FormValue("group")
	if name == "" || ownerStr == "" {
		http.Error(w, "Missing parameter", http.StatusBadRequest)
		return
	}
	filePath := filepath.Join(config.WorkDir, dir, name)
	uid, gid := -1, -1
	usr, err := user.Lookup(ownerStr)
	if err == nil {
		uidInt, _ := strconv.Atoi(usr.Uid)
		uid = uidInt
	}
	if groupStr != "" {
		grp, err := user.LookupGroup(groupStr)
		if err == nil {
			gidInt, _ := strconv.Atoi(grp.Gid)
			gid = gidInt
		}
	}
	if uid < 0 && gid < 0 {
		http.Error(w, "Invalid owner/group", http.StatusBadRequest)
		return
	}
	if err := os.Chown(filePath, uid, gid); err != nil {
		http.Error(w, "Failed to chown: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Write([]byte(`{"success":true}`))
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		relPath, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		targetPath := filepath.Join(dst, relPath)
		if info.IsDir() {
			return os.MkdirAll(targetPath, info.Mode())
		}
		from, err := os.Open(path)
		if err != nil {
			return err
		}
		defer from.Close()
		to, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
		if err != nil {
			return err
		}
		defer to.Close()
		_, err = io.Copy(to, from)
		return err
	})
}

func doCopyMove(isMove bool, w http.ResponseWriter, r *http.Request) {
	srcDir := r.FormValue("srcDir")
	dstDir := r.FormValue("dstDir")
	names := r.Form["names[]"]
	if len(names) == 0 {
		names = r.Form["names"]
	}
	if srcDir == "" || dstDir == "" || len(names) == 0 {
		http.Error(w, "Incomplete parameters", http.StatusBadRequest)
		return
	}
	var fail []string
	for _, name := range names {
		srcPath := filepath.Join(config.WorkDir, srcDir, name)
		dstPath := filepath.Join(config.WorkDir, dstDir, name)
		if srcPath == dstPath || (isMove && strings.HasPrefix(dstPath, srcPath+string(os.PathSeparator))) {
			fail = append(fail, name)
			continue
		}
		info, err := os.Lstat(srcPath)
		if err != nil {
			fail = append(fail, name)
			continue
		}
		if info.IsDir() {
			if isMove {
				err = os.Rename(srcPath, dstPath)
			} else {
				err = copyDir(srcPath, dstPath)
			}
		} else {
			if isMove {
				err = os.Rename(srcPath, dstPath)
			} else {
				from, ferr := os.Open(srcPath)
				if ferr != nil {
					fail = append(fail, name)
					continue
				}
				defer from.Close()
				if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
					fail = append(fail, name)
					continue
				}
				to, terr := os.OpenFile(dstPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
				if terr != nil {
					fail = append(fail, name)
					continue
				}
				_, err = io.Copy(to, from)
				to.Close()
			}
		}
		if err != nil {
			fail = append(fail, name)
		}
	}
	result := map[string]interface{}{
		"success": len(fail) == 0,
		"failed":  fail,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func copyHandler(w http.ResponseWriter, r *http.Request) {
	doCopyMove(false, w, r)
}

func moveHandler(w http.ResponseWriter, r *http.Request) {
	doCopyMove(true, w, r)
}
