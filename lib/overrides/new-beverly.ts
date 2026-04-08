interface NewBeverlyProgramOverride {
  exclude?: boolean;
  filmTitles?: Record<string, string>;
  notes?: string | null;
  preferredProgramTitle?: string | null;
  title?: string | null;
}

export const newBeverlyProgramOverrides: Record<
  string,
  NewBeverlyProgramOverride
> = {
  "thenewbev.com/program/april-16-the-mystery-of-the-13th-guest-the-living-ghost-the-face-of-marble": {
    preferredProgramTitle: null,
  },
};
