# Globe images

Self-hosted textures for the Explore / landing globe (`components/globe-canvas.tsx`). Taken from the
[three-globe](https://github.com/vasturiano/three-globe) package's example images (`example/img/`, v2.45.6) and
downscaled / recompressed to JPEG with `sharp`.

| File | Source | Size | Licence |
|---|---|---|---|
| `earth-blue-marble.jpg` | `earth-blue-marble.jpg`, 4096×2048, JPEG q72 | ~590 KB | NASA Blue Marble imagery (NASA Visible Earth), public domain |
| `earth-topology.jpg` | `earth-topology.png`, 2048×1024 → 1024×512 grayscale, JPEG q80 (bump map) | ~25 KB | three-globe example asset, MIT (derived from NASA topography, public domain) |
| `night-sky.jpg` | `night-sky.png`, 4096×2048 → 2048×1024, JPEG q70 (starfield background) | ~68 KB | three-globe example asset, MIT |

three-globe is © Vasco Asturiano, MIT licence.
