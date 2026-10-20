/* GIMP's Levels arithmetic, for the Tone Levels port's reference vectors.
 *
 * Transcribed from GNOME/gimp master d7ea51b237d0 (2026-10-19):
 *   app/operations/gimpoperationlevels.c  gimp_operation_levels_map,
 *                                         gimp_operation_levels_map_input,
 *                                         gimp_operation_levels_process
 *   app/operations/gimplevelsconfig.c     gimp_levels_config_stretch_channel,
 *                                         gimp_levels_config_input_from_color,
 *                                         gimp_levels_config_adjust_by_colors
 *   app/tools/gimplevelstool.c            the grey handle <-> gamma mapping
 *   libgimpcolor/gimpcolor-private.h      GIMP_RGB_LUMINANCE
 * GObject plumbing is stripped. GIMP's pixel buffers are float; this keeps
 * doubles so the JS model can be compared tightly. One deliberate change: the
 * grey picker takes its lightness from the colour as given (in the active
 * TRC), as GIMP 2.10 did, not from linear RGB as GIMP 3 does.
 *
 * GIMP - The GNU Image Manipulation Program
 * Copyright (C) 1995 Spencer Kimball and Peter Mattis
 * gimpoperationlevels.c, gimplevelsconfig.c:
 *   Copyright (C) 2007 Michael Natterer <mitch@gimp.org>
 * gimplevelstool.c:
 *   Copyright (C) 1995 Spencer Kimball and Peter Mattis */

#include <math.h>
#include <stdio.h>

#define CLAMP(x, low, high) (((x) > (high)) ? (high) : (((x) < (low)) ? (low) : (x)))
#define MAX(a, b) (((a) > (b)) ? (a) : (b))

#define GIMP_RGB_LUMINANCE_RED    (0.22248840)
#define GIMP_RGB_LUMINANCE_GREEN  (0.71690369)
#define GIMP_RGB_LUMINANCE_BLUE   (0.06060791)

#define GIMP_RGB_LUMINANCE(r,g,b) ((r) * GIMP_RGB_LUMINANCE_RED   + \
                                   (g) * GIMP_RGB_LUMINANCE_GREEN + \
                                   (b) * GIMP_RGB_LUMINANCE_BLUE)

enum { GIMP_HISTOGRAM_VALUE, GIMP_HISTOGRAM_RED, GIMP_HISTOGRAM_GREEN, GIMP_HISTOGRAM_BLUE };

#define N_CHANNELS 4
#define N_BINS     256

typedef struct
{
  double low_input[N_CHANNELS];
  double high_input[N_CHANNELS];
  double gamma[N_CHANNELS];
  double low_output[N_CHANNELS];
  double high_output[N_CHANNELS];
  int    clamp_input;
  int    clamp_output;
} LevelsConfig;

static void
config_reset (LevelsConfig *config)
{
  int c;

  for (c = 0; c < N_CHANNELS; c++)
    {
      config->low_input[c]   = 0.0;
      config->high_input[c]  = 1.0;
      config->gamma[c]       = 1.0;
      config->low_output[c]  = 0.0;
      config->high_output[c] = 1.0;
    }
  config->clamp_input  = 0;
  config->clamp_output = 0;
}

static double
gimp_operation_levels_map (double value,
                           double low_input,
                           double high_input,
                           int    clamp_input,
                           double inv_gamma,
                           double low_output,
                           double high_output,
                           int    clamp_output)
{
  /*  determine input intensity  */
  if (high_input != low_input)
    value = (value - low_input) / (high_input - low_input);
  else
    value = (value - low_input);

  if (clamp_input)
    value = CLAMP (value, 0.0, 1.0);

  if (inv_gamma != 1.0 && value > 0)
    value =  pow (value, inv_gamma);

  /*  determine the output intensity  */
  if (high_output >= low_output)
    value = value * (high_output - low_output) + low_output;
  else if (high_output < low_output)
    value = low_output - value * (low_output - high_output);

  if (clamp_output)
    value = CLAMP (value, 0.0, 1.0);

  return value;
}

static double
gimp_operation_levels_map_input (const LevelsConfig *config,
                                 int                 channel,
                                 double              value)
{
  /*  determine input intensity  */
  if (config->high_input[channel] != config->low_input[channel])
    value = ((value - config->low_input[channel]) /
             (config->high_input[channel] - config->low_input[channel]));
  else
    value = (value - config->low_input[channel]);

  if (config->gamma[channel] != 0.0 && value > 0.0)
    value = pow (value, 1.0 / config->gamma[channel]);

  return value;
}

/* The pixel loop of gimp_operation_levels_process for R, G and B. */
static void
levels_process (const LevelsConfig *config, const double *src, double *dest)
{
  double inv_gamma[N_CHANNELS];
  int    channel;

  for (channel = 0; channel < N_CHANNELS; channel++)
    inv_gamma[channel] = 1.0 / config->gamma[channel];

  for (channel = 0; channel < 3; channel++)
    {
      double value;

      value = gimp_operation_levels_map (src[channel],
                                         config->low_input[channel + 1],
                                         config->high_input[channel + 1],
                                         config->clamp_input,
                                         inv_gamma[channel + 1],
                                         config->low_output[channel + 1],
                                         config->high_output[channel + 1],
                                         config->clamp_output);

      /* don't apply the overall curve to the alpha channel */
      value = gimp_operation_levels_map (value,
                                         config->low_input[0],
                                         config->high_input[0],
                                         config->clamp_input,
                                         inv_gamma[0],
                                         config->low_output[0],
                                         config->high_output[0],
                                         config->clamp_output);

      dest[channel] = value;
    }
}

/* gimp_levels_config_stretch_channel over one channel's bins. */
static void
gimp_levels_config_stretch_channel (LevelsConfig *config,
                                    const double *histogram,
                                    int           channel)
{
  double count;
  double bias = 0.006;
  int    n_bins = N_BINS;
  int    i;

  config->gamma[channel]       = 1.0;
  config->low_output[channel]  = 0.0;
  config->high_output[channel] = 1.0;

  count = 0.0;
  for (i = 0; i < n_bins; i++)
    count += histogram[i];

  if (count == 0.0)
    {
      config->low_input[channel]  = 0.0;
      config->high_input[channel] = 0.0;
    }
  else
    {
      double new_count;
      double percentage;
      double next_percentage;

      /*  Set the low input  */
      new_count = 0.0;

      for (i = 0; i < (n_bins - 1); i++)
        {
          new_count += histogram[i];
          percentage = new_count / count;
          next_percentage = (new_count + histogram[i + 1]) / count;

          if (fabs (percentage - bias) < fabs (next_percentage - bias))
            {
              config->low_input[channel] = (double) (i + 1) / (n_bins - 1);
              break;
            }
        }

      /*  Set the high input  */
      new_count = 0.0;

      for (i = (n_bins - 1); i > 0; i--)
        {
          new_count += histogram[i];
          percentage = new_count / count;
          next_percentage = (new_count + histogram[i - 1]) / count;

          if (fabs (percentage - bias) < fabs (next_percentage - bias))
            {
              config->high_input[channel] = (double) (i - 1) / (n_bins - 1);
              break;
            }
        }
    }
}

static double
gimp_levels_config_input_from_color (int channel, const double *rgb)
{
  switch (channel)
    {
    case GIMP_HISTOGRAM_VALUE:
      return MAX (MAX (rgb[0], rgb[1]), rgb[2]);

    case GIMP_HISTOGRAM_RED:
      return rgb[0];

    case GIMP_HISTOGRAM_GREEN:
      return rgb[1];

    case GIMP_HISTOGRAM_BLUE:
      return rgb[2];
    }

  return 0.0;
}

static void
gimp_levels_config_adjust_by_colors (LevelsConfig *config,
                                     int           channel,
                                     const double *black,
                                     const double *gray,
                                     const double *white)
{
  if (black)
    config->low_input[channel] = gimp_levels_config_input_from_color (channel, black);

  if (white)
    config->high_input[channel] = gimp_levels_config_input_from_color (channel, white);

  if (gray)
    {
      double input;
      double range;
      double inten;
      double out_light;
      double lightness;

      /* Calculate lightness value (GIMP 2.10: the colour as given) */
      lightness = GIMP_RGB_LUMINANCE (gray[0], gray[1], gray[2]);

      input = gimp_levels_config_input_from_color (channel, gray);

      range = config->high_input[channel] - config->low_input[channel];
      if (range <= 0)
        return;

      input -= config->low_input[channel];
      if (input < 0)
        return;

      /* Normalize input and lightness */
      inten = input / range;
      out_light = lightness / range;

      if (out_light <= 0.0001 || out_light >= 0.9999)
        return;

      /* Map selected color to corresponding lightness */
      config->gamma[channel] = log (inten) / log (out_light);
      config->gamma[channel] = CLAMP (config->gamma[channel], 0.1, 10.0);
    }
}

/* gimp_levels_tool_config_notify: the grey handle's position, in the
 * spinbuttons' display units (factor 255 on an 8-bit image). */
static double
gamma_handle_position (double low, double high, double gamma)
{
  double delta = (high - low) / 2.0;
  double mid   = low + delta;
  double tmp   = log10 (1.0 / gamma);

  return mid + delta * tmp;
}

/* levels_linear_gamma_changed, after the gamma_linear adjustment clamps the
 * handle to [low, high]. Returns the gamma it sets, or `gamma` unchanged. */
static double
gamma_from_handle (double low, double high, double handle, double gamma)
{
  double delta, mid, tmp, value;

  handle = CLAMP (handle, low, high);
  delta  = (high - low) / 2.0;

  if (delta >= 0.5)
    {
      mid   = low + delta;
      tmp   = (handle - mid) / delta;
      value = 1.0 / pow (10, tmp);

      /*  round the gamma value to the nearest 1/100th  */
      value = floor (value * 100 + 0.5) / 100.0;

      return value;
    }

  return gamma;
}

static unsigned int
next_random (unsigned int *seed)
{
  *seed = *seed * 1103515245u + 12345u;
  return (*seed >> 16) & 0x7fffu;
}

static int first_item;

static void
begin_array (const char *name)
{
  printf ("  \"%s\": [", name);
  first_item = 1;
}

static void
item (void)
{
  printf (first_item ? "\n    " : ",\n    ");
  first_item = 0;
}

static void
end_array (int last)
{
  printf ("\n  ]%s\n", last ? "" : ",");
}

static void
print_doubles (const double *v, int n)
{
  int i;

  for (i = 0; i < n; i++)
    printf ("%s%.17g", i ? ", " : "", v[i]);
}

int
main (void)
{
  static const double values[] = { -0.2, -0.1, 0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5,
                                   0.6, 0.7, 0.8, 0.9, 0.95, 1.0, 1.1, 1.2 };
  /* low input, high input, gamma, low output, high output */
  static const double sets[][5] = {
    { 0.0,  1.0,  1.0,  0.0, 1.0 },
    { 0.1,  0.9,  1.0,  0.0, 1.0 },
    { 0.2,  0.8,  2.2,  0.0, 1.0 },
    { 0.0,  1.0,  0.45, 0.1, 0.9 },
    { 0.3,  0.3,  1.0,  0.0, 1.0 },
    { 0.05, 0.95, 1.6,  1.0, 0.0 },
    { 0.5,  0.6,  0.1,  0.2, 0.8 },
    { 0.0,  0.5,  10.0, 0.0, 1.0 },
    { 0.25, 1.0,  1.0,  0.5, 0.5 },
    { 0.4,  0.2,  1.3,  0.0, 1.0 },
  };
  static const double pixels[][3] = {
    { 0.0, 0.0, 0.0 }, { 1.0, 1.0, 1.0 }, { 0.18, 0.18, 0.18 }, { 0.8, 0.3, 0.1 },
    { 0.05, 0.6, 0.95 }, { -0.1, 0.5, 1.2 }, { 0.42, 0.42, 0.9 },
  };
  static const double colors[][3] = {
    { 0.05, 0.05, 0.05 }, { 0.5, 0.5, 0.5 }, { 0.95, 0.95, 0.95 }, { 0.8, 0.4, 0.2 },
    { 0.2, 0.6, 0.9 }, { 0.35, 0.3, 0.25 }, { 0.0, 0.0, 0.0 }, { 1.0, 1.0, 1.0 },
  };
  /* low input, high input, gamma before the pick */
  static const double starts[][3] = {
    { 0.0, 1.0, 1.0 }, { 0.1, 0.9, 1.5 }, { 0.6, 0.4, 1.0 }, { 0.3, 0.31, 1.0 },
  };
  static const double ranges[][2] = {
    { 0.0, 1.0 }, { 0.1, 0.9 }, { 0.5, 0.502 }, { 0.3, 0.3 }, { 0.25, 0.75 },
  };
  static const double gammas[] = { 0.1, 0.25, 0.5, 0.8, 1.0, 1.37, 2.2, 5.0, 10.0 };
  static const double prior[5] = { 0.2, 0.7, 1.8, 0.1, 0.9 };

  const int n_values = sizeof values / sizeof values[0];
  const int n_sets   = sizeof sets / sizeof sets[0];
  const int n_pixels = sizeof pixels / sizeof pixels[0];
  const int n_colors = sizeof colors / sizeof colors[0];
  const int n_starts = sizeof starts / sizeof starts[0];
  const int n_ranges = sizeof ranges / sizeof ranges[0];
  const int n_gammas = sizeof gammas / sizeof gammas[0];
  unsigned int seed  = 12345u;
  int s, v, ci, co, k, c, p, w, i, t, r, g;

  printf ("{\n  \"source\": \"GNOME/gimp master d7ea51b237d0aab33792793b8ed31cbfc2abb9f9\",\n");

  begin_array ("map");
  for (s = 0; s < n_sets; s++)
    for (ci = 0; ci < 2; ci++)
      for (co = 0; co < 2; co++)
        for (v = 0; v < n_values; v++)
          {
            double inv_gamma = 1.0 / sets[s][2];
            double out = gimp_operation_levels_map (values[v], sets[s][0], sets[s][1], ci,
                                                    inv_gamma, sets[s][3], sets[s][4], co);
            item ();
            printf ("[%.17g, %.17g, %.17g, %d, %.17g, %.17g, %.17g, %d, %.17g]",
                    values[v], sets[s][0], sets[s][1], ci, inv_gamma, sets[s][3], sets[s][4], co, out);
          }
  end_array (0);

  begin_array ("mapInput");
  for (s = 0; s < n_sets; s++)
    for (v = 0; v < n_values; v++)
      {
        LevelsConfig config;

        config_reset (&config);
        config.low_input[0]  = sets[s][0];
        config.high_input[0] = sets[s][1];
        config.gamma[0]      = sets[s][2];
        item ();
        printf ("[%.17g, %.17g, %.17g, %.17g, %.17g]", sets[s][0], sets[s][1], sets[s][2], values[v],
                gimp_operation_levels_map_input (&config, 0, values[v]));
      }
  end_array (0);

  begin_array ("process");
  for (k = 0; k < 8; k++)
    {
      LevelsConfig config;

      config_reset (&config);
      for (c = 0; c < N_CHANNELS; c++)
        {
          const double *set = sets[(k + 3 * c) % n_sets];

          config.low_input[c]   = set[0];
          config.high_input[c]  = set[1];
          config.gamma[c]       = set[2];
          config.low_output[c]  = set[3];
          config.high_output[c] = set[4];
        }
      config.clamp_input  = k & 1;
      config.clamp_output = (k >> 1) & 1;

      for (p = 0; p < n_pixels; p++)
        {
          double out[3];

          levels_process (&config, pixels[p], out);
          item ();
          printf ("{\"levels\": [");
          for (c = 0; c < N_CHANNELS; c++)
            {
              double five[5] = { config.low_input[c], config.high_input[c], config.gamma[c],
                                 config.low_output[c], config.high_output[c] };

              printf ("%s[", c ? ", " : "");
              print_doubles (five, 5);
              printf ("]");
            }
          printf ("], \"clampInput\": %d, \"clampOutput\": %d, \"rgb\": [", config.clamp_input, config.clamp_output);
          print_doubles (pixels[p], 3);
          printf ("], \"out\": [");
          print_doubles (out, 3);
          printf ("]}");
        }
    }
  end_array (0);

  begin_array ("stretch");
  for (p = 0; p < 8; p++)
    {
      double       histogram[N_BINS];
      double       out[5];
      LevelsConfig config;

      for (i = 0; i < N_BINS; i++)
        {
          switch (p)
            {
            case 0:  histogram[i] = 0.0; break;
            case 1:  histogram[i] = i == 0 ? 1000.0 : 0.0; break;
            case 2:  histogram[i] = i == N_BINS - 1 ? 1000.0 : 0.0; break;
            case 3:  histogram[i] = 100.0; break;
            case 4:  histogram[i] = i; break;
            case 5:  histogram[i] = floor (1000.0 * exp (-(i - 128.0) * (i - 128.0) / (2.0 * 20.0 * 20.0))); break;
            case 6:  histogram[i] = (i == 30 ? 5000.0 : i == 220 ? 3000.0 : 0.0) + (next_random (&seed) % 4); break;
            default: histogram[i] = next_random (&seed) % 1000; break;
            }
        }

      config_reset (&config);
      config.low_input[GIMP_HISTOGRAM_RED]   = prior[0];
      config.high_input[GIMP_HISTOGRAM_RED]  = prior[1];
      config.gamma[GIMP_HISTOGRAM_RED]       = prior[2];
      config.low_output[GIMP_HISTOGRAM_RED]  = prior[3];
      config.high_output[GIMP_HISTOGRAM_RED] = prior[4];
      gimp_levels_config_stretch_channel (&config, histogram, GIMP_HISTOGRAM_RED);

      out[0] = config.low_input[GIMP_HISTOGRAM_RED];
      out[1] = config.high_input[GIMP_HISTOGRAM_RED];
      out[2] = config.gamma[GIMP_HISTOGRAM_RED];
      out[3] = config.low_output[GIMP_HISTOGRAM_RED];
      out[4] = config.high_output[GIMP_HISTOGRAM_RED];

      item ();
      printf ("{\"bins\": [");
      print_doubles (histogram, N_BINS);
      printf ("], \"prior\": [");
      print_doubles (prior, 5);
      printf ("], \"out\": [");
      print_doubles (out, 5);
      printf ("]}");
    }
  end_array (0);

  begin_array ("pick");
  for (c = 0; c < N_CHANNELS; c++)
    for (w = 0; w < 3; w++)
      for (i = 0; i < n_colors; i++)
        for (s = 0; s < n_starts; s++)
          {
            LevelsConfig config;

            config_reset (&config);
            config.low_input[c]  = starts[s][0];
            config.high_input[c] = starts[s][1];
            config.gamma[c]      = starts[s][2];
            gimp_levels_config_adjust_by_colors (&config, c,
                                                 w == 0 ? colors[i] : NULL,
                                                 w == 1 ? colors[i] : NULL,
                                                 w == 2 ? colors[i] : NULL);
            item ();
            printf ("[%d, %d, %.17g, %.17g, %.17g, %.17g, %.17g, %.17g, %.17g, %.17g, %.17g]",
                    c, w, colors[i][0], colors[i][1], colors[i][2], starts[s][0], starts[s][1], starts[s][2],
                    config.low_input[c], config.high_input[c], config.gamma[c]);
          }
  end_array (0);

  begin_array ("gammaHandle");
  for (r = 0; r < n_ranges; r++)
    for (g = 0; g < n_gammas; g++)
      {
        double low  = ranges[r][0] * 255.0;
        double high = ranges[r][1] * 255.0;

        item ();
        printf ("[%.17g, %.17g, %.17g, %.17g]", ranges[r][0], ranges[r][1], gammas[g],
                gamma_handle_position (low, high, gammas[g]));
      }
  end_array (0);

  begin_array ("gammaFromHandle");
  for (r = 0; r < n_ranges; r++)
    for (t = 0; t <= 20; t++)
      {
        double pos  = -0.05 + t * 0.055;
        double low  = ranges[r][0] * 255.0;
        double high = ranges[r][1] * 255.0;

        item ();
        printf ("[%.17g, %.17g, %.17g, %.17g, %.17g]", ranges[r][0], ranges[r][1], pos, 1.0,
                gamma_from_handle (low, high, pos * 255.0, 1.0));
      }
  end_array (1);

  printf ("}\n");
  return 0;
}
