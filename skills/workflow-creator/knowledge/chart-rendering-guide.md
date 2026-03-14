# chart-rendering-guide.md — Chart and Visualization Rendering Conventions

This guide defines how AI workflow steps should generate charts and visualizations.
Step 03 should load this file when a step involves chart generation, SVG output, or
data visualization.

---

## Rendering Stack

### X-Y Charts (line charts, bar charts)

Use **Mermaid `xychart-beta`** syntax rendered to SVG via **mermaid-cli**.

- Generate Mermaid source in `.md` files with fenced code blocks:
  ````markdown
  ```mermaid
  xychart-beta
      title "Chart Title"
      x-axis ["Label1", "Label2", "Label3"]
      y-axis "Y Label" 0 --> 100
      line [10, 50, 80]
  ```
  ````
- Render to SVG using `npx --yes @mermaid-js/mermaid-cli@latest` (this already
  resolves to `mmdc` — do NOT pass `mmdc` as an extra argument)
- To extract Mermaid content for rendering, strip the ` ```mermaid ` fences and
  save as a temporary `.mmd` file

### Why not PlantUML for charts?

PlantUML does not support X-Y axis line/bar charts natively. It falls back to
legend tables which are not actual charts. PlantUML remains appropriate for
structural diagrams (sequence, class, component, activity, state, etc.).

---

## Width Consistency

When a step generates multiple visualization types (e.g., heatmap SVGs and
line chart SVGs), all visualizations must render at the same width.

### How to match widths

1. Identify the "anchor" width — typically from a programmatically generated SVG
   (e.g., a heatmap with a calculated width based on cell size, gap, and count)
2. Pass that width to mermaid-cli via a JSON config file:
   ```json
   { "xyChart": { "width": 855, "height": 400 } }
   ```
3. Render with: `npx --yes @mermaid-js/mermaid-cli@latest -i input.mmd -o output.svg -b transparent -c config.json`

### Post-processing SVGs

Mermaid outputs `width="100%"` in the SVG element, which causes charts to stretch
to fill the container when embedded in Markdown. After rendering, replace with
a fixed pixel width:

```javascript
let svg = fs.readFileSync(svgPath, 'utf-8');
svg = svg.replace('width="100%"', `width="${targetWidth}"`);
fs.writeFileSync(svgPath, svg);
```

---

## Rendering Command Reference

```bash
# Render a single .mmd file to SVG
npx --yes @mermaid-js/mermaid-cli@latest -i chart.mmd -o chart.svg -b transparent

# Render with custom width via config
npx --yes @mermaid-js/mermaid-cli@latest -i chart.mmd -o chart.svg -b transparent -c mermaid-config.json

# Check version (for availability check in scripts)
npx --yes @mermaid-js/mermaid-cli@latest --version
```

**Common mistakes to avoid:**

- Do NOT use `npx @mermaid-js/mermaid-cli@latest mmdc ...` — the extra `mmdc`
  argument causes "too many arguments" errors
- Do NOT rely on `width="100%"` in rendered SVGs — always post-process to fixed width
- Do NOT use PlantUML for X-Y charts — it has no native support for them

---

## When to Apply This Guide

Load this guide in Step 03 when any of these conditions are true:

- A step's objective mentions charts, graphs, visualizations, or SVG generation
- A step's output artifact includes `.svg` files
- A step involves rendering data as visual output (heatmaps, line charts, bar charts)

When generating prompts for chart-producing steps, include:

1. Instructions to generate Mermaid source files (`.md` with fenced code blocks)
2. The rendering command using mermaid-cli
3. Width-matching config if the step also produces other SVGs
4. Post-processing step to fix `width="100%"`
5. Success criteria that verify `.svg` files exist and contain valid SVG content
