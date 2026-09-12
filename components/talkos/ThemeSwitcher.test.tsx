import { act, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeSwitcher } from "./ThemeSwitcher";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("ThemeSwitcher", () => {
  it("hydrates before restoring a saved client preference", async () => {
    localStorage.setItem("talkos-theme", "system");
    const container = document.createElement("div");
    container.innerHTML = renderToString(<ThemeSwitcher />);
    document.body.appendChild(container);

    localStorage.setItem("talkos-theme", "dark");
    const consoleErrors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(" "));
    });

    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, <ThemeSwitcher />);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
    });
    expect(consoleErrors.join("\n")).not.toMatch(/hydration|didn't match/i);

    await act(async () => root?.unmount());
  });
});
