# Stylesheet Structure

`main.css` is now an entrypoint that imports focused modules in strict order.

## Files

- `tokens.css`: global design tokens and dark-theme defaults (`:root` custom properties).
- `base.css`: reset, scrollbars, selection, and `body` background/base typography smoothing.
- `shell.css`: layout and top-level shell UI (`.page`, headers, board, theme toggle).
- `controls.css`: mode buttons, bus filters, generic buttons.
- `status.css`: status/meta text and permission card.
- `departures.css`: result area, next departure summary, departure rows, badges, train info.
- `motion.css`: keyframes and responsive rules.
- `theme-light.css`: all light-theme overrides (single source, scoped to `[data-theme="light"]`).

## Editing Rules

- Add new styles to the closest module instead of `main.css`.
- Keep import order in `main.css` stable unless there is a cascade reason to change it.
- Put shared values in `tokens.css` before adding repeated literals.
- Theme mode is resolved to a concrete `data-theme` value by `web/scripts/theme-init.js`.
- If changing light theme visuals, update only `[data-theme="light"]` rules in `theme-light.css`.

## Why this split

- Smaller files reduce merge conflicts and make agent edits more predictable.
- The module boundaries follow UI responsibilities used in `index.html` and `app.js`.
