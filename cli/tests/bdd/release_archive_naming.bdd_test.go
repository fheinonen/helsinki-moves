package bdd_test

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"

	testruntime "hm/internal/testing"
)

func TestReleaseArchiveNaming(t *testing.T) {
	scenarios, err := testruntime.LoadScenariosWithStepParser(filepath.Join("release_archive_naming.scenarios.txt"), parseReleaseArchiveStep)
	if err != nil {
		t.Fatal(err)
	}

	for _, sc := range scenarios {
		sc := sc
		t.Run(sc.Name, func(t *testing.T) {
			cliDir := cliRootDir(t)
			distDir := t.TempDir()
			runReleaseScript(t, cliDir, distDir, sc.Values["version"], "build-release.sh", sc.Values["goos"], sc.Values["goarch"], nil)
			var extraEnv []string
			if sc.Values["zipFallback"] == "pwsh" {
				extraEnv = []string{"PATH=" + createPowerShellFallbackPath(t)}
			}
			runReleaseScript(t, cliDir, distDir, sc.Values["version"], "archive-release.sh", sc.Values["goos"], sc.Values["goarch"], extraEnv)
			testruntime.RunChecksWithEvidence(t, testruntime.Evidence{Archives: releaseArchives(t, distDir)}, sc.Checks)
		})
	}
}

func cliRootDir(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func parseReleaseArchiveStep(line string, sc *testruntime.Scenario) error {
	switch {
	case strings.HasPrefix(line, "Given the release version is "):
		sc.Values["version"] = testruntime.Unquote(strings.TrimPrefix(line, "Given the release version is "))
		return nil
	case line == "Given zip is unavailable and PowerShell is available":
		sc.Values["zipFallback"] = "pwsh"
		return nil
	case strings.HasPrefix(line, "When the release matrix builds and archives "):
		target := strings.Fields(strings.TrimPrefix(line, "When the release matrix builds and archives "))
		if len(target) != 2 {
			return fmt.Errorf("scenario %q: invalid target step %q", sc.Name, line)
		}
		sc.Values["goos"] = target[0]
		sc.Values["goarch"] = target[1]
		return nil
	default:
		return fmt.Errorf("unrecognized step in scenario %q: %q", sc.Name, line)
	}
}

func createPowerShellFallbackPath(t *testing.T) string {
	t.Helper()

	pwshDir := t.TempDir()
	pwshPath := filepath.Join(pwshDir, "pwsh")
	pwshScript := "#!/bin/sh\nset -eu\ncase \"$*\" in *Compress-Archive*) ;; *) exit 1 ;; esac\n: > \"$DIST_DIR/hm_${VERSION}_windows_amd64.zip\"\n"
	if err := os.WriteFile(pwshPath, []byte(pwshScript), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, tool := range []string{"dirname", "rm"} {
		toolPath, err := exec.LookPath(tool)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(toolPath, filepath.Join(pwshDir, tool)); err != nil {
			t.Fatal(err)
		}
	}
	return pwshDir
}

func runReleaseScript(t *testing.T, cliDir, distDir, version, scriptName, goos, goarch string, extraEnv []string) {
	t.Helper()

	cmd := exec.Command(filepath.Join(cliDir, "scripts", scriptName), goos, goarch)
	cmd.Dir = cliDir
	cmd.Env = append(append(os.Environ(),
		"VERSION="+version,
		"DIST_DIR="+distDir,
	), extraEnv...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%s failed: %v\n%s", scriptName, err, output)
	}
}

func releaseArchives(t *testing.T, distDir string) []string {
	t.Helper()

	entries, err := os.ReadDir(distDir)
	if err != nil {
		t.Fatal(err)
	}

	var archives []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		archives = append(archives, entry.Name())
	}
	sort.Strings(archives)
	return archives
}
