import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RequireAuth from "../src/components/RequireAuth";
import { AuthProvider } from "../src/auth/AuthContext";
import { setToken } from "../src/api/client";

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <div>Protected Content</div>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("RequireAuth", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setToken(null);
  });

  it("renders its children when a token is present", () => {
    setToken("tok-abc");

    renderProtected();

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects to /login when no token is present", () => {
    renderProtected();

    expect(screen.getByText("Login Screen")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });
});
