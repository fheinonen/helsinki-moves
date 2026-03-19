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
goos=$1
goarch=$2

require_version

stem="hm_${VERSION}_${goos}_${goarch}"
package_dir="$dist_dir/$stem"
binary_name=hm
archive_ext=.tar.gz

if [ "$goos" = "windows" ]; then
	binary_name=hm.exe
	archive_ext=.zip
fi

if [ ! -f "$package_dir/$binary_name" ]; then
	printf '%s\n' "missing built binary: $package_dir/$binary_name" >&2
	exit 1
fi

archive_path="$dist_dir/$stem$archive_ext"
rm -f "$archive_path"

if [ "$goos" = "windows" ]; then
	if ! command -v zip >/dev/null 2>&1; then
		printf '%s\n' "zip is required to package Windows releases" >&2
		exit 1
	fi
	(
		cd "$dist_dir"
		zip -qr "$archive_path" "$stem"
	)
else
	tar -C "$dist_dir" -czf "$archive_path" "$stem"
fi

printf '%s\n' "$archive_path"
