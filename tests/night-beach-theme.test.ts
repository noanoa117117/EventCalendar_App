import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("NightScene is an accessible fixed-position decoration", () => {
  const scene = read("src/components/night-beach-scene.tsx");

  assert.match(scene, /export function NightScene/, "NightScene must be exported");
  assert.match(scene, /aria-hidden="true"/, "NightScene wrapper must be aria-hidden");
  assert.match(scene, /pointer-events-none/, "scene layers must be pointer-events-none");
  assert.match(scene, /fixed inset-0/, "scene layers must be position:fixed");
});

test("NightScene contains sky, stars, moon, sea, and palms", () => {
  const scene = read("src/components/night-beach-scene.tsx");

  assert.match(scene, /scene-sky/, "must include sky layer");
  assert.match(scene, /scene-stars/, "must include stars layer");
  assert.match(scene, /scene-moon/, "must include moon");
  assert.match(scene, /scene-meteor/, "must include meteors");
  assert.match(scene, /scene-sea/, "must include sea");
  assert.match(scene, /scene-swell/, "must include swells");
  assert.match(scene, /scene-wash/, "must include wash");
  assert.match(scene, /scene-sand/, "must include sand");
  assert.match(scene, /scene-palm/, "must include palm trees");
  assert.match(scene, /preserveAspectRatio="xMidYMax meet"/, "palms must preserve aspect ratio");
});

test("CSS has full-page scene layers with correct z-index", () => {
  const css = read("src/app/globals.css");

  assert.match(css, /\.scene-sky\s*{[^}]*position:\s*fixed;\s*inset:\s*0;\s*z-index:\s*-3/, "sky must be fixed and behind everything");
  assert.match(css, /\.scene-stars,\s*\.scene-stars-2\s*{[^}]*position:\s*fixed;\s*inset:\s*0;\s*z-index:\s*-2/, "stars must be fixed");
  assert.match(css, /\.scene-moon\s*{[^}]*position:\s*fixed;/, "moon must be fixed");
  assert.match(css, /\.scene-sea\s*{[^}]*position:\s*fixed;[^}]*bottom:\s*0;\s*z-index:\s*-2/, "sea must be fixed to the bottom");
  assert.match(css, /mask-image:\s*linear-gradient\(180deg,\s*#000 0%,\s*#000 50%,\s*transparent 72%\)/, "stars must be masked to the upper portion");
});

test("header is a glass navbar without scene elements", () => {
  const header = read("src/components/app-header.tsx");

  assert.match(header, /glass-nav/, "header must use the glass-nav class");
  assert.doesNotMatch(header, /NightSky/, "header must not import or render NightSky");
  assert.doesNotMatch(header, /night-sky-bg/, "header must not use the old night-sky-bg class");

  const css = read("src/app/globals.css");
  assert.match(css, /\.glass-nav\s*{[^}]*backdrop-filter:\s*blur/, "glass-nav must define a blur backdrop-filter");
});

test("event calendar renders NightScene without the page-content padding wrapper", () => {
  const calendar = read("src/app/events/event-calendar.tsx");

  assert.match(calendar, /import.*NightScene.*from "@\/components\/night-beach-scene"/, "must import NightScene");
  assert.match(calendar, /<NightScene/, "must render NightScene");
  assert.doesNotMatch(calendar, /BeachScene/, "old BeachScene must not be referenced");
  assert.doesNotMatch(calendar, /page-content/, "event calendar must not use page-content (h-dvh layout)");
});

test("CSS supports reduced motion", () => {
  const css = read("src/app/globals.css");
  const reducedMotionBlock = css.match(/@media \(prefers-reduced-motion: reduce\) {[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(reducedMotionBlock, /scene-stars/, "stars must respect reduced-motion");
  assert.match(reducedMotionBlock, /scene-meteor/, "meteors must respect reduced-motion");
  assert.match(reducedMotionBlock, /scene-swell/, "swells must respect reduced-motion");
  assert.match(reducedMotionBlock, /scene-wash/, "wash must respect reduced-motion");
  assert.match(reducedMotionBlock, /display:\s*none/, "meteors must be hidden outright under reduced motion");
});

test("layout keeps the dark class on html", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /className=\{`[^`]* dark [^`]*`\}/);
});

test("calendar scrim uses the semantic theme token", () => {
  const calendar = read("src/app/events/event-calendar.tsx");
  const dialog = read("src/components/ui/dialog.tsx");

  assert.doesNotMatch(calendar, /bg-black\/30/);
  assert.match(calendar, /bg-scrim/);
  assert.match(dialog, /bg-scrim/);
});
