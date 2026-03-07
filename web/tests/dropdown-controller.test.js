const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Reusable custom dropdown keyboard behavior

Scenario: Arrow navigation and enter select the focused option
  Given a closed custom dropdown with option values "8|12|16"
  When the user presses "ArrowDown"
  And the user presses "ArrowDown"
  And the user presses "Enter"
  Then the selected dropdown value is "12"
  And the dropdown is closed

Scenario: Escape closes an open custom dropdown
  Given a open custom dropdown with option values "8|12|16"
  When the user presses "Escape"
  Then the dropdown is closed
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    dropdown: null,
    selectedValue: "",
    trigger: null,
    list: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given a (closed|open) custom dropdown with option values "([^"]*)"$/,
      run: ({ args, world }) => {
        const { createDropdownHarness } = require("./helpers/frontend-app");
        const { createDropdownController } = require("../scripts/app/dropdown-controller");
        const initialOpen = args[0] === "open";
        const harness = createDropdownHarness(args[1].split("|"));
        world.trigger = harness.trigger;
        world.list = harness.list;
        world.selectedValue = "";
        world.dropdown = createDropdownController({
          triggerEl: harness.trigger,
          listEl: harness.list,
          onSelect: (value) => {
            world.selectedValue = value;
          },
        });
        world.dropdown.setOpen(initialOpen);
      },
    },
    {
      pattern: /^When the user presses "([^"]*)"$/,
      run: ({ args, world }) => {
        world.dropdown.handleKeyDown({
          key: args[0],
          preventDefault() {},
        });
      },
    },
    {
      pattern: /^Then the selected dropdown value is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.selectedValue, args[0]);
      },
    },
    {
      pattern: /^Then the dropdown is (open|closed)$/,
      run: ({ assert, args, world }) => {
        assert.equal(
          world.trigger.getAttribute("aria-expanded") === "true",
          args[0] === "open"
        );
      },
    },
  ],
});
