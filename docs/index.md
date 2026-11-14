---
layout: home

hero:
  name: 'sm<span class="alt">alt</span><span class="suffix kit">kit</span>'
  text: 'Small. Alternative.<br>Reusable.'
  tagline: Reusable components for the smaltworks applications.
  image:
    light: /case-mark.svg
    dark: /case-mark-on-dark.svg
    alt: smaltkit
  actions:
    - theme: brand
      text: Quick start
      link: /quick-start
    - theme: alt
      text: Read the docs →
      link: /reference/
features:
  - title: Loads smaltdb
    details: Starts the engine from the app's own copy, npm or any URL, reports its version, and runs an environment's data steps in one format for every app.
    link: /reference/engine
    linkText: smaltkit/engine
  - title: Draws data
    details: Charts, maps, tables and pivot matrices as SVG and HTML strings, a virtualized grid for any number of rows, and a graph view on the GPU.
    link: /reference/charts
    linkText: smaltkit/charts
  - title: Edits code
    details: A small code editor for SQL, Cypher and TypeScript, with completion from the schema, and TypeScript stripped and checked by smaltty.
    link: /reference/editor
    linkText: smaltkit/editor
  - title: Takes the brand's colours
    details: Everything reads its colours, type and sizes from --sk-* custom properties that default to the smalt brand tokens, so a theme is a set of values.
    link: /reference/styles
    linkText: smaltkit/ui.css
---

The engine loader, charts, tables, the data grid, the code editor and the rest of what the smalt apps share around
smaltdb, in strict TypeScript, as plain ES modules that load in a page without a bundler. No dependencies.
