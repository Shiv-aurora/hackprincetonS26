# Layout Shell

The layout shell provides the VS Code-style three-pane window frame that all views live in.

## How the view registry works

`ViewRegistry.ts` exports a `VIEW_REGISTRY` object mapping every `ViewId` to a `ViewDefinition`:

```ts
interface ViewDefinition {
  id: ViewId;
  title: string;
  component: React.FC<ViewProps>;
  validPanes: PaneSlot[];      // where this view may be placed
  backendDeps: string[];       // API endpoints this view calls
}
```

`PaneContainer` uses `VIEW_REGISTRY` to:
1. Render the active view component inside the pane body.
2. Populate the view-picker dropdown with only the views whose `validPanes` includes the current `PaneSlot`.

## localStorage key format and schema

Each persona's layout is stored under the key `ngsp.layout.<persona>`:

- `ngsp.layout.analyst`
- `ngsp.layout.reviewer`

The stored value is a JSON-serialised `LayoutPreset`:

```ts
{
  persona: "analyst" | "reviewer",
  panes: {
    left:  { viewId, width, collapsed },
    main:  { viewId, width, collapsed },
    right: { viewId, width, collapsed },
  },
  bottomDockExpanded: boolean,
  bottomDockHeightPct: number,   // 8–60
}
```

`width` values are percentages that sum to 100 across the three panes (collapsed panes retain their percentage in state; SplitterGroup renders them at 32 px and distributes the remainder).

## How a Phase-6 agent adds a new view (3-step recipe)

1. **Define the component.** Create `frontend/src/views/<persona>/<MyView>.tsx` implementing `React.FC<ViewProps>`. Every function must have a one-line comment above its declaration.

2. **Add to `ViewId` union.** In `ViewRegistry.ts`, add the new string literal to the `ViewId` type:
   ```ts
   export type ViewId = ... | "my-new-view";
   ```

3. **Add to `VIEW_REGISTRY`.** In `ViewRegistry.ts`, import the component and add an entry:
   ```ts
   "my-new-view": {
     id: "my-new-view",
     title: "My New View",
     component: MyNewView,
     validPanes: ["main", "right"],
     backendDeps: ["/api/my-endpoint"],
   },
   ```

The view will immediately appear in the view-picker dropdown of any pane that includes its slot in `validPanes`. No other changes are required.
