Feature: README CLI documentation contract

  Scenario: CLI section documents the Go entrypoint and release binaries
    Given the repository README includes a CLI section
    When the CLI section is reviewed
    Then the CLI section contains "`cli/`"
    And the CLI section contains "`go test ./...`"
    And the CLI section contains "`go run ./cmd/hm --help`"
    And the CLI section contains "`./scripts/build-release.sh`"
    And the CLI section contains "`./scripts/archive-release.sh`"
    And the CLI section contains "`hm_<version>_<goos>_<goarch>.tar.gz`"
    And the CLI section does not contain "`bin/hm.mjs`"
    And the CLI section does not contain "`node --test bin/hm.test.mjs`"
