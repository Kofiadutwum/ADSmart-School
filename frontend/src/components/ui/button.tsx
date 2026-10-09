import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const BASE =
  "press inline-flex cursor-pointer items-center justify-center gap-2 rounded-control font-semibold disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS = {
  amber: "bg-amber text-on-amber hover:brightness-105",
  primary: "bg-primary text-white hover:brightness-110",
  glass: "glass-clear text-white hover:brightness-125",
  outline: "border border-line text-ink hover:bg-ink/5",
} as const;

const SIZES = { md: "min-h-11 px-5 text-base", lg: "min-h-12 px-6 text-lg" } as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const EXTERNAL = /^(https?:|tel:|mailto:)/;

export function ButtonLink({ href, variant, size, className, ...props }: ButtonLinkProps) {
  const classes = buttonClasses(variant, size, className);
  if (EXTERNAL.test(href)) return <a href={href} className={classes} {...props} />;
  return <Link href={href} className={classes} {...props} />;
}
