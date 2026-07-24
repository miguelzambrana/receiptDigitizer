import { describe, it, expect, beforeEach, vi } from "vitest";
import { login, getToken, setToken, api } from "../src/api/client";

describe("api client", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setToken(null);
    vi.restoreAllMocks();
  });

  it("login posts credentials and stores the returned token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "abc123", token_type: "bearer" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await login("a@b.com", "secret");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/auth/login");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ email: "a@b.com", password: "secret" });
    expect(getToken()).toBe("abc123");
  });

  it("sends Authorization header with bearer token on an authed GET", async () => {
    setToken("tok-xyz");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.get("/receipts");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer tok-xyz");
  });

  it("clears the token and throws on a 401 response", async () => {
    setToken("tok-xyz");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "unauthorized" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get("/receipts")).rejects.toThrow();
    expect(getToken()).toBeNull();
  });
});
