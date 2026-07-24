import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RequireAuth from "../src/components/RequireAuth";
import { AuthProvider } from "../src/auth/AuthContext";
import { setToken, getToken, api } from "../src/api/client";

function renderApp() {
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

describe("401 token de-sync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setToken(null);
    vi.restoreAllMocks();
  });

  it("routes to /login when a client request gets a 401, even mid-session", async () => {
    setToken("tok-xyz");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "unauthorized" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    expect(screen.getByText("Protected Content")).toBeInTheDocument();

    await act(async () => {
      await expect(api.get("/receipts")).rejects.toThrow();
    });

    await waitFor(() =>
      expect(screen.getByText("Login Screen")).toBeInTheDocument(),
    );
    expect(getToken()).toBeNull();
  });
});
