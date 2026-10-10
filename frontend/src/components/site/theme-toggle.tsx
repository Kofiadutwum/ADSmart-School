"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import {
  applyTheme,
  readStoredChoice,
  resolveTheme,
  storeChoice,
  subscribeToChoice,
  systemPrefersDark,
  type ThemeChoice,
} from "@/lib/theme";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function selectTheme(choice: ThemeChoice) {
  storeChoice(choice);
  const theme = resolveTheme(choice, systemPrefersDark());
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
  if (doc.startViewTransition && !reduceMotion) doc.startViewTransition(() => applyTheme(theme));
  else applyTheme(theme);
}

const serverChoice = (): ThemeChoice => "system";

export function ThemeToggle({ showLabels = false, className }: { showLabels?: boolean; className?: string }) {
  const choice = useSyncExternalStore(subscribeToChoice, readStoredChoice, serverChoice);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = STEP[event.key];
    if (!step) return;
    event.preventDefault();
    const nextIndex = (index + step + OPTIONS.length) % OPTIONS.length;
    selectTheme(OPTIONS[nextIndex].value);
    const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[nextIndex]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn("inline-flex items-center gap-1 rounded-full p-1", className)}>
      {OPTIONS.map(({ value, label, Icon }, index) => {
        const checked = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={showLabels ? undefined : label}
            tabIndex={checked ? 0 : -1}
            onClick={() => selectTheme(value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "press inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full px-3 text-sm font-medium",
              checked ? "bg-card text-ink shadow-elev-1" : "opacity-80 hover:opacity-100",
            )}
          >
            <Icon aria-hidden className="size-5" />
            {showLabels && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
