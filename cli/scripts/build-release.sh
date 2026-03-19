#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
	printf '%s\n' "usage: VERSION=yyyy.m.d $0 <goos> <goarch>" >&2
	exit 2
fi

require_version() {
	case "${VERSION:-}" in
		[0-9][0-9][0-9][0-9].[0-9].[0-9] | \
		[0-9][0-9][0-9][0-9].[0-9].[0-9][0-9] | \
		[0-9][0-9][0-9][0-9].[0-9][0-9].[0-9] | \
		[0-9][0-9][0-9][0-9].[0-9][0-9].[0-9][0-9])
			return 0
			;;
		*)
			printf '%s\n' "VERSION must use yyyy.m.d format" >&2
			exit 2
			;;
	esac
}

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cli_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
dist_dir=${DIST_DIR:-"$cli_dir/dist"}
go_bin=${GO:-go}
goos=$1
goarch=$2

require_version

stem="hm_${VERSION}_${goos}_${goarch}"
package_dir="$dist_dir/$stem"
binary_name=hm

if [ "$goos" = "windows" ]; then
	binary_name=hm.exe
fi

rm -rf "$package_dir"
mkdir -p "$package_dir"

cd "$cli_dir"
CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" "$go_bin" build -trimpath -ldflags="-s -w" -o "$package_dir/$binary_name" ./cmd/hm
printf '%s\n' "$package_dir/$binary_name"
