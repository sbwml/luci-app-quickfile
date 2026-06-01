#!/bin/bash

version=quickfile-$(grep -oP 'Version\s*=\s*"v\K[^"]+' internal/config/config.go)

mkdir -p $version

CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w -extldflags "-static"' -o $version/quickfile.x86_64 .
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags='-s -w -extldflags "-static"' -o $version/quickfile.aarch64 .
CGO_ENABLED=0 GOOS=linux GOARCH=arm go build -trimpath -ldflags='-s -w -extldflags "-static"' -o $version/quickfile.arm .

upx --lzma --best $version/quickfile.x86_64
upx --lzma --best $version/quickfile.aarch64
upx --lzma --best $version/quickfile.arm

tar zcvf $version.tar.gz $version

sha256sum $version.tar.gz

echo "mc cp $version.tar.gz r2/openwrt/source/"
