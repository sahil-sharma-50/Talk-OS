"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

type ThemePreference = "light" | "system" | "dark";

const themePreferenceChanged = "talkos-theme-preference-changed";

function readThemePreference(): ThemePreference {
  const stored = localStorage.getItem("talkos-theme");
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function subscribeToThemePreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(themePreferenceChanged, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(themePreferenceChanged, onStoreChange);
  };
}

export function ThemeSwitcher() {
  const preference = useSyncExternalStore(subscribeToThemePreference, readThemePreference, () => "system");

  const setPreference = (nextPreference: ThemePreference) => {
    localStorage.setItem("talkos-theme", nextPreference);
    window.dispatchEvent(new Event(themePreferenceChanged));
  };

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = preference === "system" && media?.matches ? "dark" : preference === "system" ? "light" : preference;
      document.documentElement.dataset.themePreference = preference;
    };
    apply();
    media?.addEventListener?.("change", apply);
    return () => media?.removeEventListener?.("change", apply);
  }, [preference]);

  const options = [
    { id: "light" as const, label: "Light theme", icon: Sun },
    { id: "system" as const, label: "System theme", icon: Monitor },
    { id: "dark" as const, label: "Dark theme", icon: Moon },
  ];

  return (
    <div className="theme-switcher" role="group" aria-label="Color theme">
      {options.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" aria-label={label} aria-pressed={preference === id} onClick={() => setPreference(id)}>
          <Icon size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
