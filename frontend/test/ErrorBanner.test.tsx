import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBanner from "../src/components/ErrorBanner";

describe("ErrorBanner", () => {
  it("renders nothing when there is no message", () => {
    const { container } = render(<ErrorBanner message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the message with an alert role when provided", () => {
    render(<ErrorBanner message="Something went wrong" />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
  });
});
