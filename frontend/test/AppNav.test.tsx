import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppNav from "../src/components/AppNav";
import { AuthProvider } from "../src/auth/AuthContext";
import { getToken, setToken } from "../src/api/client";

function renderAppNav() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AppNav />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AppNav", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setToken("tok-abc");
  });

  it("renders links to Capture and Products", () => {
    renderAppNav();

    expect(screen.getByRole("link", { name: "Capture" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute(
      "href",
      "/products",
    );
  });

  it("calls logout (clearing the token) when the Logout button is clicked", () => {
    renderAppNav();

    fireEvent.click(screen.getByRole("button", { name: /logout/i }));

    expect(getToken()).toBeNull();
  });
});
