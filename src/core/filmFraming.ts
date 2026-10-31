import { normalizeCutOptions } from "./directorsCut";
import type { CutOptions, ProjectState } from "./model";

/** Keep the Sweet Jesus landscape default for older saves without overriding an explicit choice. */
export function effectiveFilmCutOptions(project: Pick<ProjectState, "cutOptions" | "story"> | null | undefined): Required<CutOptions> {
  const options = project?.cutOptions ?? project?.story.cutOptions;
  if (project?.story.id === "sweet-jesus-film" && !options?.aspectFraming) {
    return normalizeCutOptions({ ...options, aspectFraming: "16:9" });
  }
  return normalizeCutOptions(options);
}
