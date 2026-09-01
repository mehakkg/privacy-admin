"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Light / dark toggle, for comparing the two directions.
 *
 * The theme is a `data-theme` attribute on <html> and nothing more — every
 * colour in the product resolves through CSS custom properties, so one
 * attribute flip repaints the whole app rather than the component it is
 * rendered in.
 *
 * The preference is read in a blocking inline script in the document head (see
 * layout.tsx), not here. Setting it from this effect would paint the light
 * theme first and correct it on hydration, which is a visible flash on every
 * navigation — and unusable for the back-and-forth comparison this is for.
 */
const STORAGE_KEY = "privacy-admin.theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Read what the head script already applied, rather than deciding again.
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Blocked storage: the toggle still works, it just will not persist.
    }
  };

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
