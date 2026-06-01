package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"

	"git.cooluc.com/sbwml/quickfile/internal/config"
	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// 终端接口
func terminalHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("failed to upgrade websocket: %v", err)
		return
	}
	defer conn.Close()

	dir := r.URL.Query().Get("dir")
	if dir == "" {
		dir = "."
	}
	fullPath := filepath.Join(config.WorkDir, dir)

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("powershell.exe")
	} else {
		shells := []string{"bash", "ash", "sh"}
		var shellPath string
		for _, s := range shells {
			if p, err := exec.LookPath(s); err == nil {
				shellPath = p
				break
			}
		}
		if shellPath == "" {
			shellPath = "/bin/sh"
		}

		cmd = exec.Command(shellPath, "-l")

		cmd.Env = append(os.Environ(),
			"SHELL="+shellPath,
			"USER=root",
			"HOME=/root",
		)
	}
	cmd.Dir = fullPath

	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("failed to start pty: %v", err)
		conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Failed to start pty: %v", err)))
		return
	}
	defer func() {
		if cmd.Process != nil {
			cmd.Process.Kill()
			cmd.Wait()
		}
		ptmx.Close()
	}()

	colsStr := r.URL.Query().Get("cols")
	rowsStr := r.URL.Query().Get("rows")
	if colsStr != "" && rowsStr != "" {
		cols, _ := strconv.Atoi(colsStr)
		rows, _ := strconv.Atoi(rowsStr)
		if cols > 0 && rows > 0 {
			pty.Setsize(ptmx, &pty.Winsize{Rows: uint16(rows), Cols: uint16(cols)})
		}
	}

	go func() {
		defer func() {
			ptmx.Close()
		}()
		for {
			msgType, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("websocket read error: %v", err)
				break
			}

			if msgType == websocket.TextMessage && len(message) > 0 && message[0] == '{' {
				var resizeMsg struct {
					Type string `json:"type"`
					Cols int    `json:"cols"`
					Rows int    `json:"rows"`
				}
				if err := json.Unmarshal(message, &resizeMsg); err == nil && resizeMsg.Type == "xterm-resize" {
					if resizeMsg.Cols > 0 && resizeMsg.Rows > 0 {
						pty.Setsize(ptmx, &pty.Winsize{Rows: uint16(resizeMsg.Rows), Cols: uint16(resizeMsg.Cols)})
					}
					continue
				}
			}

			if _, err := ptmx.Write(message); err != nil {
				log.Printf("pty write error: %v", err)
				break
			}
		}
	}()

	buf := make([]byte, 4096)
	for {
		n, err := ptmx.Read(buf)
		if err != nil {
			log.Printf("pty read error: %v", err)
			break
		}
		if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
			log.Printf("websocket write error: %v", err)
			break
		}
	}
}
