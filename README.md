# Tone Levels for Safelight

A port of GIMP's Levels tool (Colors ▸ Levels) as a Develop panel. Pick a
channel (Value, Red, Green or Blue), set its black, grey and white input
points over the image's histogram and its output range, and let GIMP's Auto
Input Levels or its eyedroppers do it for you.

- **Input Levels:** the histogram of the image before Levels, the input bar
  previewing the mapping, and black, grey and white handles. The grey handle
  is gamma, placed and rounded exactly as GIMP places and rounds it.
- **Output Levels:** the range the input maps onto. The handles may cross,
  which inverts the channel, as in GIMP.
- **Clamp input / Clamp output:** clip to 0–255 before or after the output
  mapping. On photos with the current processing, the values Levels hands on
  can go beyond white or below black. Clamp output keeps them in range for
  whatever comes after Levels (the final image is always clipped to white),
  for example when a colour channel pushed past white is mapped again by
  Value.
- **Perceptual / Linear:** work on the display-encoded values (GIMP 3's
  default) or on linear light.
- **All Channels:** Auto Input Levels stretches red, green and blue separately
  (which also neutralises a cast) and resets Value. The black, grey and white
  eyedroppers set those points per channel from a 5×5 patch of the image. The
  eyedroppers sample the view you are looking at (so they follow zoom), while
  the histogram and Auto measure the whole photo. Esc cancels an armed
  eyedropper, and they are unavailable while the Crop tool or another core
  tool or picker is active. The pickers beside the input fields act on the
  selected channel only.
- **In masks:** add Tone Levels to a mask from the Masking panel's Adjust tab
  to apply a second set of levels inside that mask only. The mask's Levels
  have the same controls as the panel's except the histogram, Auto Input
  Levels and the eyedroppers, which measure the whole photo. It needs the
  current processing: on a photo edited in an earlier Safelight, use Update
  processing first.

Each colour channel runs first, then Value, which applies the same curve to
all three channels. The numbers show GIMP's 0–255 scale, and a typed number
applies when you press Enter or leave the field.

## Differences from GIMP

- The grey eyedropper measures its target lightness in the same encoding as
  the picked value, as GIMP 2.10 did. GIMP 3 measures it in linear light even
  in Perceptual mode, which darkens a neutral grey pick.
- Eyedroppers average a 5×5 patch (Safelight's white-balance picker rule)
  instead of one pixel.
- The histogram and Auto Input Levels measure the whole photo, rendered small
  with Levels switched off, so tools that run after Levels (Vignette, Grain)
  are in it and values above white land in the top bin. A panel bypassed with
  its preview eye, or the crop tool's widened view, is not reflected.
- No Alpha channel, no "Edit these Settings as Curves", no GIMP levels files:
  Safelight presets carry Tone Levels' settings.

## Development

```bash
npm install
npm test               # vitest: the maths against GIMP's C, the panel, the stage contract
npm run typecheck
npm run test:gpu       # the stage in a SafeLight checkout's WebGL rig (SAFELIGHT_CORE=…)
npm run test:reference # regenerate test/reference/vectors.json (needs gcc)
npm run build          # dist/index.js, the file Safelight loads
```

## License

GPL-3.0-or-later. The maths is ported from GIMP, Copyright (C) 1995 Spencer
Kimball and Peter Mattis and the GIMP authors (levels: Copyright (C) 2007
Michael Natterer), GPL-3.0-or-later.
