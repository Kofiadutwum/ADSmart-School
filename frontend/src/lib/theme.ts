export type ThemeChoice = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "adss-theme";
const CHANGE_EVENT = "adss-theme-change";

/** Browser chrome colours; keep in step with --paper in globals.css. */
export const THEME_COLORS: Record<Theme, string> = { light: "#faf9f6", dark: "#0b0a1f" };

export function parseChoice(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  if (choice === "system") return prefersDark ? "dark" : "light";
  return choice;
}

export function readStoredChoice(): ThemeChoice {
  try {
    return parseChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function storeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private browsing: the choice applies until the page reloads.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToChoice(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = THEME_COLORS[theme];
  });
}
