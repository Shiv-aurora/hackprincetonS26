# Keyboard Shortcuts

All shortcuts use ⌘ (Cmd) on macOS and Ctrl on Windows/Linux.

## Layout

| Shortcut | Action |
|----------|--------|
| ⌘1 | Focus left pane |
| ⌘2 | Focus main pane |
| ⌘3 | Focus right pane |
| ⌘J | Toggle bottom dock |
| ⌘\ | Collapse / expand left pane |
| ⌘⇧\ | Collapse / expand right pane |
| ⌘⇧P | Open view picker in focused pane |

## Persona

| Shortcut | Action |
|----------|--------|
| ⌘⇧A | Switch to Analyst persona |
| ⌘⇧R | Switch to Reviewer persona |

## Notes

- Pane focus (⌘1/2/3) highlights the pane with a focus ring but does not steal focus from inputs.
- ⌘⇧P dispatches a `ngsp:open-view-picker` custom DOM event; PaneContainer listens for it.
- Layouts are persisted per persona in `localStorage` under `ngsp.layout.<persona>`.
- Shortcuts registered globally via `window.addEventListener("keydown", …)` in `App.tsx`.
