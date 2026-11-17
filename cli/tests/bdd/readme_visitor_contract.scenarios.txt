Feature: README for a casual visitor

  Scenario: The opening shows what the board does before any setup
    Given the repository README is on disk
    When the text before the setup guide is taken
    Then stdout contains "https://helsinkimoves.fheinonen.eu"
    And stdout contains "short press"
    And stdout contains "long press"
    And stdout contains "walking time"
    And stdout contains "A check"
    And stdout contains "A cross"
    And stdout contains "destination color"
    And stdout contains "dark edge"
    And stdout contains "bottom of the board"
    And stdout contains "later departures"
    And stdout contains "The first push that reaches the end does not load"
    And stdout contains "Digitransit"
    And stdout contains "date and time"
    And stdout contains "OpenStreetMap"
    And stdout contains "ODbL"
    And stdout contains "Enter"
    And stdout contains "Space"
    And stdout contains "departure time"
    And stdout contains "main landmark"
    And stdout contains "text scale"
    And stdout does not contain "## Run a copy"
    And stdout does not contain "## CLI"
