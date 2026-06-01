package api

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"git.cooluc.com/sbwml/quickfile/internal/config"
	"github.com/ulikunitz/xz"
)

type CompressRequest struct {
	Paths   []string `json:"paths"`
	Target  string   `json:"target"`
	Format  string   `json:"format"` // zip / tar.gz / tar.xz
	WorkDir string   `json:"workdir"`
}

func compressHandler(w http.ResponseWriter, r *http.Request) {
	var req CompressRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	baseDir := filepath.Join(config.WorkDir, req.WorkDir)
	fullTarget := filepath.Join(baseDir, req.Target)

	var fullPaths []string
	for _, p := range req.Paths {
		fullPaths = append(fullPaths, filepath.Join(baseDir, p))
	}

	switch req.Format {
	case "zip":
		err := compressToZip(fullPaths, fullTarget)
		respondJSON(w, err)
	case "tar.gz":
		err := compressToTar(fullPaths, fullTarget, true)
		respondJSON(w, err)
	case "tar.xz":
		err := compressToTar(fullPaths, fullTarget, false)
		respondJSON(w, err)
	default:
		http.Error(w, "unsupported format", http.StatusBadRequest)
	}
}

func compressToZip(paths []string, target string) error {
	out, err := os.Create(target)
	if err != nil {
		return err
	}
	defer out.Close()
	zipWriter := zip.NewWriter(out)
	defer zipWriter.Close()
	for _, p := range paths {
		err = filepath.Walk(p, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			relPath, _ := filepath.Rel(filepath.Dir(p), path)
			if info.IsDir() {
				return nil
			}
			f, err := os.Open(path)
			if err != nil {
				return err
			}
			defer f.Close()
			w, err := zipWriter.Create(relPath)
			if err != nil {
				return err
			}
			_, err = io.Copy(w, f)
			return err
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func compressToTar(paths []string, target string, gz bool) error {
	outFile, err := os.Create(target)
	if err != nil {
		return err
	}
	defer outFile.Close()

	var writer io.WriteCloser
	var tw *tar.Writer

	if gz {
		gzipWriter := gzip.NewWriter(outFile)
		writer = gzipWriter
		tw = tar.NewWriter(gzipWriter)
	} else {
		xzWriter, err := xz.NewWriter(outFile)
		if err != nil {
			return err
		}
		writer = xzWriter
		tw = tar.NewWriter(xzWriter)
	}

	for _, root := range paths {
		err := filepath.Walk(root, func(file string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			relPath, err := filepath.Rel(filepath.Dir(root), file)
			if err != nil {
				return err
			}
			if relPath == "." {
				return nil
			}

			header, err := tar.FileInfoHeader(info, "")
			if err != nil {
				return err
			}
			header.Name = relPath

			if err := tw.WriteHeader(header); err != nil {
				return err
			}

			if info.Mode().IsRegular() {
				f, err := os.Open(file)
				if err != nil {
					return err
				}
				defer f.Close()
				if _, err := io.Copy(tw, f); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
	}

	if err := tw.Close(); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return nil
}

type DecompressRequest struct {
	Archive string `json:"archive"`
	Target  string `json:"target"`
}

// 解压入口
func decompressHandler(w http.ResponseWriter, r *http.Request) {
	var req DecompressRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	archivePath := filepath.Join(config.WorkDir, req.Target, req.Archive)
	targetDir := filepath.Join(config.WorkDir, req.Target)

	var err error
	switch {
	case strings.HasSuffix(req.Archive, ".zip"):
		err = decompressZip(archivePath, targetDir)
	case strings.HasSuffix(req.Archive, ".tar.gz"), strings.HasSuffix(req.Archive, ".tgz"):
		err = decompressTarGz(archivePath, targetDir)
	case strings.HasSuffix(req.Archive, ".tar.xz"):
		err = decompressTarXz(archivePath, targetDir)
	default:
		http.Error(w, "unsupported format", http.StatusBadRequest)
		return
	}
	respondJSON(w, err)
}

// zip 解压
func decompressZip(archive, target string) error {
	r, err := zip.OpenReader(archive)
	if err != nil {
		return err
	}
	defer r.Close()
	for _, f := range r.File {
		path := filepath.Join(target, f.Name)
		if f.FileInfo().IsDir() {
			os.MkdirAll(path, 0755)
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		defer rc.Close()
		os.MkdirAll(filepath.Dir(path), 0755)
		out, err := os.Create(path)
		if err != nil {
			return err
		}
		_, err = io.Copy(out, rc)
		out.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

// tar.gz 解压
func decompressTarGz(archive, target string) error {
	f, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer f.Close()
	gzReader, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gzReader.Close()
	return untar(gzReader, target)
}

// tar.xz 解压
func decompressTarXz(archive, target string) error {
	f, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer f.Close()
	xzReader, err := xz.NewReader(f)
	if err != nil {
		return err
	}
	return untar(xzReader, target)
}

// untar 工具
func untar(reader io.Reader, target string) error {
	tr := tar.NewReader(reader)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		path := filepath.Join(target, hdr.Name)
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(path, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				return err
			}
			f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(hdr.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(f, tr); err != nil {
				f.Close()
				return err
			}
			f.Close()
		}
	}
	return nil
}
