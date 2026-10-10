import { THEME_COLORS, THEME_STORAGE_KEY } from "./theme";

export type LiteEnvironment = {
  forced: boolean;
  saveData: boolean;
  deviceMemory?: number;
  supportsBackdrop: boolean;
  prefersReducedTransparency: boolean;
};

/** Lite mode swaps blur for solid surfaces on weak or data-saving devices (spec §8.2). */
export function shouldUseLite(env: LiteEnvironment): boolean {
  return (
    env.forced ||
    env.saveData ||
    (env.deviceMemory !== undefined && env.deviceMemory <= 2) ||
    !env.supportsBackdrop ||
    env.prefersReducedTransparency
  );
}

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme, and keeps every
 * page following the device while the choice is System (not only pages with a theme toggle).
 * Mirrors resolveTheme(), applyTheme() and shouldUseLite(); boot-script.test.ts executes it.
 */
export const BOOT_SCRIPT = `(function(){var d=document.documentElement;
try{var c=null;try{c=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}
var dark=c==="dark"||(c!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);
d.dataset.theme=dark?"dark":"light";d.style.colorScheme=dark?"dark":"light";}catch(e){}
try{matchMedia("(prefers-color-scheme: dark)").addEventListener("change",function(e){var s=null;
try{s=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(x){}if(s==="light"||s==="dark")return;
var t=e.matches?"dark":"light",colors=${JSON.stringify(THEME_COLORS)};d.dataset.theme=t;d.style.colorScheme=t;
document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=colors[t]})})}catch(e){}
try{var n=navigator,k=n.connection,css=window.CSS&&CSS.supports;
var lite=/[?&]lite=1(&|$)/.test(location.search)||!!(k&&k.saveData)
||(typeof n.deviceMemory==="number"&&n.deviceMemory<=2)
||!(css&&(CSS.supports("backdrop-filter","blur(1px)")||CSS.supports("-webkit-backdrop-filter","blur(1px)")))
||matchMedia("(prefers-reduced-transparency: reduce)").matches;
if(lite)d.setAttribute("data-lite","");}catch(e){}})();`;
