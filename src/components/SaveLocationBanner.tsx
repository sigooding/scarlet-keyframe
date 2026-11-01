import { fileSaveWarning, isOpenedFromFile } from "../core/saveLocation";

/**
 * One line, only when the page was opened from disk (`file:`): those saves live
 * in a different place from the ones at the localhost address, so the same
 * browser appears to have lost the project.
 */
export function SaveLocationBanner() {
  if (!isOpenedFromFile()) return null;
  return (
    <div className="save-location-banner" role="status" data-testid="file-save-warning">
      {fileSaveWarning()}
    </div>
  );
}
