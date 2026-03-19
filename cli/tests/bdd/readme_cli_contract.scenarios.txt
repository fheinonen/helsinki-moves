Feature: README CLI documentation contract

  Scenario: CLI section documents the Go entrypoint and release binaries
    Given the repository README includes a CLI section
    When the CLI section is reviewed
    Then stdout contains "`cli/`"
    And stdout contains "go test ./..."
    And stdout contains "go run ./cmd/hm --help"
    And stdout contains "`GitHub Releases`"
    And stdout contains "./scripts/build-release.sh"
    And stdout contains "./scripts/archive-release.sh"
    And stdout contains "hm_2026.3.19_darwin_arm64.tar.gz"
    And stdout contains "hm_2026.3.19_darwin_amd64.tar.gz"
    And stdout contains "hm_2026.3.19_linux_amd64.tar.gz"
    And stdout contains "hm_2026.3.19_linux_arm64.tar.gz"
    And stdout contains "hm_2026.3.19_windows_amd64.zip"
    And stdout does not contain "`bin/hm.mjs`"
    And stdout does not contain "`node --test bin/hm.test.mjs`"
