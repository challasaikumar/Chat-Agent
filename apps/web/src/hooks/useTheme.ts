import { useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "minimi.theme";

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return preference;
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
    return "system";
  });
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    typeof window === "undefined" ? "dark" : resolveTheme(preference),
  );

  useEffect(() => {
    const next = resolveTheme(preference);
    setResolved(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);

  useEffect(() => {
    if (preference !== "system") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(resolveTheme("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  return {
    preference,
    resolved,
    setPreference,
    toggle: () =>
      setPreference((prev) =>
        resolveTheme(prev) === "dark" ? "light" : "dark",
      ),
  };
}
