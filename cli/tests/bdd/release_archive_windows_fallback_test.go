package bdd_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestWindowsArchiveFallsBackToPowerShellWhenZipIsMissing(t *testing.T) {
	cliDir := cliRootDir(t)
	distDir := t.TempDir()

	runReleaseScript(t, cliDir, distDir, "2026.3.20", "build-release.sh", "windows", "amd64")

	pwshDir := t.TempDir()
	pwshPath := filepath.Join(pwshDir, "pwsh")
	pwshScript := "#!/bin/sh\nset -eu\n: > \"$DIST_DIR/hm_2026.3.20_windows_amd64.zip\"\n"
	if err := os.WriteFile(pwshPath, []byte(pwshScript), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, tool := range []string{"dirname", "rm"} {
		if err := os.Symlink(filepath.Join("/bin", tool), filepath.Join(pwshDir, tool)); err != nil {
			t.Fatal(err)
		}
	}

	cmd := exec.Command(filepath.Join(cliDir, "scripts", "archive-release.sh"), "windows", "amd64")
	cmd.Dir = cliDir
	cmd.Env = append(os.Environ(),
		"VERSION=2026.3.20",
		"DIST_DIR="+distDir,
		"PATH="+pwshDir,
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("archive-release.sh failed: %v\n%s", err, output)
	}

	archivePath := filepath.Join(distDir, "hm_2026.3.20_windows_amd64.zip")
	info, statErr := os.Stat(archivePath)
	if statErr != nil {
		t.Fatalf("expected fallback archive at %s: %v", archivePath, statErr)
	}
	if info.IsDir() {
		t.Fatalf("expected archive file, got directory: %s", archivePath)
	}
	if !strings.Contains(string(output), archivePath) {
		t.Fatalf("stdout missing archive path %q: %s", archivePath, output)
	}
}
