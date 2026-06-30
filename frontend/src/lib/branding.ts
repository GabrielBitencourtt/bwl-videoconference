export interface Branding {
  product_name?: string;
  accent_color?: string;
  logo_url?: string;
}

/** Apply a license's branding (accent color + product name) to the whole app
 *  by overriding the --brand-* CSS variables and the document title. */
export function applyBranding(b?: Branding | null) {
  if (!b) return;
  const root = document.documentElement;
  if (b.accent_color) {
    root.style.setProperty("--brand-accent", b.accent_color);
    root.style.setProperty("--brand-accent-hover", b.accent_color);
  }
  if (b.product_name) document.title = b.product_name;
}
