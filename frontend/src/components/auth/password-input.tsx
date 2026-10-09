"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";
import { inputClasses } from "@/components/site/field";
import { cn } from "@/lib/cn";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** A password field with a show button. Pasting and password managers work (WCAG 3.3.8). */
export function PasswordInput({ className, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        spellCheck={false}
        className={cn(inputClasses, "pr-14", className)}
      />
      <button
        type="button"
        aria-label="Show password"
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-control text-ink-muted hover:text-ink"
      >
        {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
      </button>
    </div>
  );
}
