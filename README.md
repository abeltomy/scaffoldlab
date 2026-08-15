# ScaffoldLab — 3D scaffolding planning & estimation

Browser-based tool for wrapping a building model in a modular scaffold and taking off the
material quantities. Load a 3D building (or pick one of six built-in samples), and the app analyses
the exterior geometry, generates a scaffold that follows the façade lift by lift, and produces a
quantity and weight take-off.

> **Preliminary planning estimate — not an engineering design.** Quantities are planning figures
> only. They are not a substitute for structural engineering, site assessment, manufacturer
> requirements, local regulations, or a certified scaffolding design.

**Live demo:** https://abeltomy.github.io/scaffoldlab/

## Quick start

```bash
npm install
```

```bash
npm run dev
```

The terrace-houses sample loads automatically and is scaffolded on first paint. Everything runs in the
browser — there is no backend.

## What it does

**Workflow:** load building → analyse geometry → set scaffold configuration → generate scaffold →
read quantities → export.

- **Sample buildings** — six procedural models, each exercising a different case of the generator:
  terrace houses (16 m — the clearest view of an individual bay), an L-shaped block (re-entrant
  corner), a warehouse shed, a round tower (curved façade approximated by straight bays), a
  cruciform tower (many corners per ring) and the 381 m setback high-rise.
- **Import** — GLB, GLTF, OBJ, STL, FBX (drag-and-drop or file picker). Loaders are code-split and
  fetched per format.
- **Building analysis** — height, width, depth, bounding box, ground footprint area and perimeter,
  approximate façade area, major face count, triangle count.
- **Model scale** — unit presets (m/cm/mm/in/ft), a free scale factor, and calibration from a known
  real height. Rescaling never re-runs the expensive analysis.
- **Scaffold configuration** — bay length, lift height, offset from the building, number of rows,
  deck width, stock member lengths, bracing pattern, decking frequency, base height, top extension,
  scaffolded fraction of the height, toe boards. Each geometric parameter is a slider that
  regenerates the scaffold and the estimate live while you drag; regeneration is throttled to the
  model's own generation cost, so heavy models stay responsive and always settle on the released
  value. Stock lengths only re-run the take-off — they never rebuild geometry.
- **Systems** — steel tube & fitting, aluminium, and a bamboo mode with its own tighter default
  grid, pole lengths and materials.
- **Quantities** — standards, ledgers, transoms/putlogs, braces, double guard rails, decks, toe
  boards and façade sheeting (debris netting / shrink-wrap / printed banner); lengths, areas, member
  counts, purchasable piece counts, connections and weight. Every line expands to show the
  derivation behind the number.
- **Viewport** — orbit/pan/zoom, saved views, perspective/orthographic, per-layer visibility and
  opacity, a display-only member-thickness multiplier (a 48 mm tube is sub-pixel on a 380 m tower,
  so members are drawn exaggerated — quantities are never affected), colour modes (normal, component type, height, material), member-type filters, a section
  plane on any axis, a two-point measurement tool, component picking with a properties panel, and an
  orientation cube plus XYZ triad.
- **Export** — quantities as CSV or JSON, full component list as CSV, a printable PDF report with a 3D screenshot, and the scaffold geometry as GLB / GLTF / OBJ.
- **Projects** — save the scaffold configuration, materials and scale to browser storage or a
  `.json` file. (Model files must be re-selected — a browser cannot reopen a local file by itself.)

## How the scaffold follows the building

The hard part is producing a scaffold that follows setbacks, wings and curves rather than a box
around the bounding volume. The pipeline:

1. **Voxelise** (`geometry/buildingAnalyzer.ts`) — every triangle is sampled onto a 3D occupancy
   raster: a stack of horizontal binary slices. Resolution adapts to the model and is capped for
   memory. This runs in a Web Worker and its result is transferred, not copied.
2. **Silhouette per lift** (`geometry/perimeterGenerator.ts`) — for each scaffold lift, the slices in
   that height band are OR-ed together and the outer contour is traced. Using the union over the
   band guarantees the lift clears the widest part of the building within it (cornices, the
   underside of a setback).
3. **Simplify** (`geometry/polygon.ts`) — the voxel staircase is collapsed back into straight façade
   runs with Ramer–Douglas–Peucker at roughly one cell of tolerance, preserving real corners.
4. **Offset** — the contour is miter-offset outward by the clearance, with a miter limit so sharp
   corners bevel instead of spiking.
5. **Bay out** — the ring is divided into bays: corners are kept as nodes, and each straight run is
   split into the whole number of bays closest to the nominal spacing, so bay length varies slightly
   exactly as it does on site.
6. **Generate members** (`geometry/scaffoldGenerator.ts`) — standards at every node of every row,
   ledgers along the façade, transoms across the rows, diagonal braces on the outer row, decks,
   toe boards, double guard rails (top at 1.0 m, mid at 0.5 m above each deck) and, when enabled,
   a sheeting panel per bay per lift. Additional rows are produced by stepping along per-node outward normals, so
   every row has matching node counts and the decks stay rectangular.

Because each lift is derived independently, the scaffold naturally steps in at a setback and stops
where the building stops.

## Architecture

The calculation engine is pure TypeScript with no Three.js dependency — it works on structured
geometry data, so the same code can later run on a server, in a mobile app, or behind an API.

```
src/
  scaffolding/            ← pure engine (no Three.js)
    types.ts              ← BuildingModel, ScaffoldConfiguration, ScaffoldComponent, …
    geometry/
      buildingAnalyzer.ts ← voxelisation, dimensions, façade area, scale
      contour.ts          ← binary mask → closed loops
      polygon.ts          ← simplify, offset, resample, hull
      perimeterGenerator.ts
      scaffoldGenerator.ts
    calculations/
      quantityCalculator.ts ← take-off + audit trail per line
    materials/materialLibrary.ts
    export/exporters.ts   ← CSV / JSON / printable report
  workers/analysis.worker.ts
  three/                  ← rendering only
    Viewer.tsx, BuildingView.tsx, ScaffoldView.tsx, sampleBuildings.ts,
    modelLoader.ts, geometryExport.ts
  store/                  ← Zustand state + local project persistence
  ui/                     ← top bar, sidebars, bottom bar, primitives
```

### Performance

- One `InstancedMesh` per component type: a 120 000-member scaffold is ~8 draw calls.
- Analysis runs in a worker; the raster is transferred, not cloned.
- Rescaling the model only rewrites raster metadata — no re-voxelisation.
- The analysis triangle budget subsamples very dense meshes with a uniform stride.
- Generation is capped at 400 000 members; beyond that the app warns and asks for coarser spacing.
- Members become interactive only in select mode, so pointer moves do not raycast 100 000 instances.

Reference numbers on the 381 m demo tower at 1.8 m bays / 2.0 m lifts: 192 lifts, ~123 000 members,
generation ~100 ms.

### Dev handles

In development only, `window.scaffoldlab` exposes the Zustand store and `window.r3f` the
react-three-fiber state — useful for driving the pipeline from the console.

## Known limits / next steps

- Scaffold is generated per lift, so vertical continuity across a setback is implied rather than
  modelled; standards are counted as stock-length pieces from total length.
- Interior courtyards are ignored — only the outer silhouette is scaffolded.
- Interactive editing covers selecting, deleting a member and disabling a whole lift; free-form
  component authoring is not implemented.
- No public-model provider yet. The model-loading layer is provider-shaped, so an OpenStreetMap
  (Overpass) or 3D-repository importer can slot in, but v1 is local file import only.
- GIS/city mode (multiple buildings, terrain, coordinates) is designed for but not implemented.

## License

MIT — see [LICENSE](LICENSE).
