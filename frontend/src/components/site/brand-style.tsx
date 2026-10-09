import type { BrandTokens } from "@/lib/types";

const NAME = /^--[a-z-]+$/;
const VALUE = /^[#a-z0-9(). /]+$/i;

function declarations(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .filter(([name, value]) => NAME.test(name) && VALUE.test(value))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

/**
 * A school's brand colours over the platform palette (amendment §7.2). The values are Django's
 * contrast-checked tokens; anything that is not a plain colour is dropped.
 */
export function BrandStyle({ brand }: { brand: BrandTokens }) {
  const light = declarations(brand.light);
  const dark = declarations(brand.dark);
  if (!light && !dark) return null;
  const css =
    `:root:not([data-theme="dark"]){${light}}` +
    `[data-theme="dark"]{${dark}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme]){${dark}}}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
