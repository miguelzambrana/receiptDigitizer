import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LoginPage from "../src/auth/LoginPage";
import { AuthProvider } from "../src/auth/AuthContext";
import * as client from "../src/api/client";

vi.mock("../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../src/api/client")>(
    "../src/api/client",
  );
  return {
    ...actual,
    login: vi.fn(),
    register: vi.fn(),
  };
});

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls login and redirects to the capture screen on success", async () => {
    vi.mocked(client.login).mockResolvedValue({
      access_token: "tok-123",
      token_type: "bearer",
    });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>Capture Screen</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() =>
      expect(client.login).toHaveBeenCalledWith("a@b.com", "secret"),
    );
    await waitFor(() =>
      expect(screen.getByText("Capture Screen")).toBeInTheDocument(),
    );
  });
});
