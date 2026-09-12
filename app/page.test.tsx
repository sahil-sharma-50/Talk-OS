import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import HomePage from "./page";

it("presents TalkOS and a live voice entry control", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { name: /talkos/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /start voice agent/i })).toBeInTheDocument();
});
