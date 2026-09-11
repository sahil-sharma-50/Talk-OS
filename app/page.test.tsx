import { render, screen } from "@testing-library/react";
import HomePage from "./page";

it("presents TalkOS and a demo entry control", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { name: /talkos/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /run the demo/i })).toBeInTheDocument();
});
