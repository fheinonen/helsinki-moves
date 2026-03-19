package bdd_test

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

type releaseArchiveScenario struct {
	Name        string
	Version     string
	GOOS        string
	GOARCH      string
	ArchiveName string
}

func TestReleaseArchiveNaming(t *testing.T) {
	scenarios, err := loadReleaseArchiveScenarios(filepath.Join("release_archive_naming.scenarios.txt"))
	if err != nil {
		t.Fatal(err)
	}

	for _, sc := range scenarios {
		sc := sc
		t.Run(sc.Name, func(t *testing.T) {
			cliDir := cliRootDir(t)
			distDir := t.TempDir()
			stageReleaseBinary(t, distDir, sc)

			cmd := exec.Command(filepath.Join(cliDir, "scripts", "archive-release.sh"), sc.GOOS, sc.GOARCH)
			cmd.Dir = cliDir
			cmd.Env = append(os.Environ(),
				"VERSION="+sc.Version,
				"DIST_DIR="+distDir,
			)
			output, err := cmd.CombinedOutput()
			if err != nil {
				t.Fatalf("archive-release.sh failed: %v\n%s", err, output)
			}

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
			if len(archives) != 1 || archives[0] != sc.ArchiveName {
				t.Fatalf("archive names = %v, want [%s]", archives, sc.ArchiveName)
			}
		})
	}
}

func loadReleaseArchiveScenarios(path string) ([]releaseArchiveScenario, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var (
		out     []releaseArchiveScenario
		current *releaseArchiveScenario
	)

	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		switch {
		case line == "", strings.HasPrefix(line, "Feature:"):
			continue
		case strings.HasPrefix(line, "Scenario:"):
			out = append(out, releaseArchiveScenario{Name: strings.TrimSpace(strings.TrimPrefix(line, "Scenario:"))})
			current = &out[len(out)-1]
		case current == nil:
			continue
		case strings.HasPrefix(line, "Given the release version is "):
			current.Version = unquote(strings.TrimPrefix(line, "Given the release version is "))
		case strings.HasPrefix(line, "When the release matrix builds "):
			target := strings.Fields(strings.TrimPrefix(line, "When the release matrix builds "))
			if len(target) != 2 {
				return nil, fmt.Errorf("scenario %q: invalid target step %q", current.Name, line)
			}
			current.GOOS = target[0]
			current.GOARCH = target[1]
		case strings.HasPrefix(line, "Then the archive name is "):
			current.ArchiveName = unquote(strings.TrimPrefix(line, "Then the archive name is "))
		default:
			return nil, fmt.Errorf("scenario %q: unrecognized step %q", current.Name, line)
		}
	}
	if err := s.Err(); err != nil {
		return nil, err
	}

	for _, sc := range out {
		if sc.Version == "" || sc.GOOS == "" || sc.GOARCH == "" || sc.ArchiveName == "" {
			return nil, fmt.Errorf("scenario %q is incomplete", sc.Name)
		}
	}

	return out, nil
}

func cliRootDir(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func stageReleaseBinary(t *testing.T, distDir string, sc releaseArchiveScenario) {
	t.Helper()

	binaryName := "hm"
	if sc.GOOS == "windows" {
		binaryName += ".exe"
	}
	stageDir := filepath.Join(distDir, archiveStem(sc.ArchiveName))
	if err := os.MkdirAll(stageDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stageDir, binaryName), []byte("binary"), 0o755); err != nil {
		t.Fatal(err)
	}
}

func archiveStem(name string) string {
	if strings.HasSuffix(name, ".tar.gz") {
		return strings.TrimSuffix(name, ".tar.gz")
	}
	return strings.TrimSuffix(name, filepath.Ext(name))
}
