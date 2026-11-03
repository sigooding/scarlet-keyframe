import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LightsFlaresPanel, type LightsFlaresPanelProps, type PointEditState } from "../components/LightsFlaresPanel";
import type { CinematicSettings } from "../../vendor/scarlet-reel/types";

const noop = () => {};
const NONE: PointEditState = { target: null, placing: false };

function render(props: Partial<LightsFlaresPanelProps> = {}) {
  return renderToStaticMarkup(
    <LightsFlaresPanel
      cinematic={undefined}
      edit={NONE}
      onEditChange={noop}
      canPlaceOnViewer
      onApply={noop}
      onPreview={noop}
      onDragStart={noop}
      onDragEnd={noop}
      {...props}
    />,
  );
}

const withLight: CinematicSettings = {
  lights: [{ x: 40, y: 50, color: "#ffb45a", intensity: 0.5, size: 30, pulseSeconds: 3.5, pulseAmount: 0.3 }],
};
const withLightAndFlare: CinematicSettings = {
  ...withLight,
  lensFlare: { preset: "warm-amber", x: 60, y: 40, intensity: 0.7 },
};

describe("the Lights & flares panel", () => {
  it("starts empty, with both add buttons and a plain-words hint", () => {
    const html = render();
    expect(html).toContain('data-testid="lights-flares-panel"');
    expect(html).toContain("NONE YET");
    expect(html).toContain('data-testid="add-light"');
    expect(html).toContain('data-testid="add-flare"');
    expect(html).toContain('data-testid="lf-empty"');
    expect(html).toContain("Noir lighting");
    expect(html).not.toContain("lf-placing-hint");
  });

  it("lists a card for every light and flare, and counts them", () => {
    const html = render({ cinematic: withLightAndFlare });
    expect(html).toContain("2 ON THIS SHOT");
    expect(html).toContain('data-testid="lf-light-0"');
    expect(html).toContain('data-testid="lf-flare-0"');
    expect(html).not.toContain('data-testid="lf-empty"');
  });

  it("opens the selected light's controls (colour, brightness, size, position, glow, its own flare)", () => {
    const html = render({ cinematic: withLight, edit: { target: { kind: "light", index: 0 }, placing: false } });
    for (const id of ["lf-light-0-color", "lf-light-0-intensity", "lf-light-0-size", "lf-light-0-x", "lf-light-0-y", "lf-light-0-flare-toggle"]) {
      expect(html, id).toContain(`data-testid="${id}"`);
    }
    for (const mode of ["steady", "slow", "flicker"]) expect(html).toContain(`data-testid="lf-light-0-glow-${mode}"`);
  });

  it("asks to click the picture while placing, and says nothing otherwise", () => {
    const target = { kind: "light", index: 0 } as const;
    expect(render({ cinematic: withLight, edit: { target, placing: true } })).toContain('data-testid="lf-placing-hint"');
    expect(render({ cinematic: withLight, edit: { target, placing: false } })).not.toContain("lf-placing-hint");
  });

  it("cannot add anything to a shot with no picture", () => {
    const html = render({ disabled: true });
    expect(html).toContain("Choose a picture for this shot first.");
    expect(html).not.toContain('data-testid="lf-empty"');
  });

  it("says so while the viewer is still dissolving in, but only when there is something to see", () => {
    const dissolving = render({ cinematic: withLight, dissolvingIn: true, onShowShot: noop });
    expect(dissolving).toContain('data-testid="lf-dissolve-note"');
    expect(dissolving).toContain('data-testid="lf-show-shot"');
    expect(render({ cinematic: withLight, dissolvingIn: false })).not.toContain("lf-dissolve-note");
    expect(render({ cinematic: undefined, dissolvingIn: true })).not.toContain("lf-dissolve-note");
    expect(render({ cinematic: withLight, dissolvingIn: true, disabled: true })).not.toContain("lf-dissolve-note");
  });

  it("shows the noir lighting that the shot has", () => {
    const html = render({ noirLighting: "venetian-slats" });
    expect(html).toMatch(/<option value="venetian-slats" selected/);
  });
});
