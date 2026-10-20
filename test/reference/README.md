# Reference vectors

`gimp_ref.c` is GIMP's own C for Levels: the per-pixel map and its input-bar
preview, the process loop (each channel, then Value), Auto Input Levels'
stretch, the eyedroppers' `adjust_by_colors` and the grey handle's gamma
mapping, transcribed from GNOME/gimp master `d7ea51b237d0` with the GObject
plumbing stripped. `build.cjs` compiles it with gcc and writes `vectors.json`;
the tests read the JSON, so a machine without gcc still runs the suite.
Regenerate with `npm run test:reference` after touching the C.

The one deliberate departure from GIMP 3: the grey picker's lightness comes
from the picked colour as given, in the active TRC, as GIMP 2.10 computed it.
GIMP 3 takes it from linear RGB even in Perceptual mode, which darkens a
neutral grey pick.
