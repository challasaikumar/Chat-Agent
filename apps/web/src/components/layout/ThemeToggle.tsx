import { Moon, Sun } from "lucide-react";

type Props = {
  resolved: "light" | "dark";
  onToggle: () => void;
};

export function ThemeToggle({ resolved, onToggle }: Props) {
  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon"
      onClick={onToggle}
      aria-label={
        resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
    >
      {resolved === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
