# Analyst Views

Two views for the Analyst persona: `DatasetPreviewView` (left pane) and `DashboardView` (right pane).

## Charting library choice: visx

**visx** was chosen over Recharts and raw D3 for the following reasons:

| Criterion | visx | Recharts | Raw D3 |
|---|---|---|---|
| HeatmapRect | `@visx/heatmap` provides it natively | Not available | Requires custom canvas/SVG code |
| React integration | First-class hooks + components | First-class | Manual DOM manipulation |
| Composability | Primitives, no opinions | Opinionated charts | Maximum flexibility |
| TypeScript types | Strong types in every package | Good | None (separate `@types/d3`) |
| Bundle size | Tree-shakeable per sub-package | Monolithic | Full d3 bundle |

Recharts was eliminated because it lacks `HeatmapRect`. Raw D3 was eliminated because it does not integrate cleanly with React's reconciler (imperative vs. declarative). visx provides the right level of abstraction — SVG primitives with React — while shipping all five required chart kinds.

## Table library choice: TanStack Table v8 + TanStack Virtual v3

TanStack Table v8 is the current canonical headless table library for React. No newer library displaces it for the following reasons:

- Headless by design: zero imposed DOM structure, full control over styling.
- `useVirtualizer` from TanStack Virtual v3 is the matching virtualizer, maintained by the same team, with an identical mental model.
- Column definitions, sorting, and filtering are all first-class features with TypeScript-inferred types.
- Works correctly with strict mode React 19.

## How to add a new chart kind to ChartGrid

1. **Add a new case to the `switch` statement** in `ChartWrapper` inside `ChartGrid.tsx`:

```tsx
case "my-new-kind":
  return <MyNewChart spec={spec} width={width} />;
```

2. **Implement the `MyNewChart` component** in `ChartGrid.tsx` (or a separate file for complex charts), following the same `{ spec: ChartSpec; width: number }` props contract. Use `@visx` primitives where possible. Add a one-line comment above the component declaration per CLAUDE.md §5.

No other files need to change. The `DashboardView` and `ChartGrid` router already handle the dispatch.
