import { aiElements } from "./ai-elements";
import { appShell } from "./app-shell";
import { foundations } from "./foundations";
import { lighting } from "./lighting";
import { motionSection } from "./motion";
import { petSection } from "./pet";
import { uiControls } from "./ui-controls";
import { uiOverlays } from "./ui-overlays";
import type { Section } from "../_lib/types";

/** Reading order: tokens first, then what is built out of them. */
export function getCatalog(locale?: string): readonly Section[] {
  return [
    foundations(locale),
    uiControls(locale),
    uiOverlays(locale),
    motionSection(locale),
    lighting(locale),
    aiElements(locale),
    appShell(locale),
    petSection(locale),
  ];
}
