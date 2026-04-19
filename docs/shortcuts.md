# NGSP Keyboard Shortcuts

All shortcuts use **Cmd** on macOS and **Ctrl** on Linux/Windows.

## Pane focus

| Shortcut | Action |
|----------|--------|
| `Cmd+1` | Focus left pane |
| `Cmd+2` | Focus main pane |
| `Cmd+3` | Focus right pane |

## Pane visibility

| Shortcut | Action |
|----------|--------|
| `Cmd+\` | Collapse/expand left pane |
| `Cmd+Shift+\` | Collapse/expand right pane |

## View picker

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+P` | Open view picker in the currently focused pane |

## Bottom dock

| Shortcut | Action |
|----------|--------|
| `Cmd+J` | Toggle forensic log (bottom dock) open/closed |

## Persona switching

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+A` | Switch to **Analyst** persona (dataset, chat, dashboard) |
| `Cmd+Shift+R` | Switch to **Reviewer** persona (narrative, case timeline, signal map) |

## Notes

- Pane focus (`Cmd+1/2/3`) highlights the pane with a focus ring but does not steal focus from inputs.
- `Cmd+Shift+P` dispatches a `ngsp:open-view-picker` custom DOM event; PaneContainer listens for this to open its dropdown.
- Layouts are persisted per persona in `localStorage` under `ngsp.layout.<persona>`.
