import type {
  AuthResponse,
  ConfirmReceiptResponse,
  PriceObservation,
  Product,
  Receipt,
  ReceiptData,
  ReceiptListItem,
  UploadReceiptResponse,
} from "./types";

const TOKEN_KEY = "receipts_token";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "Unauthorized";
  }
}

let token: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

export function setToken(t: string | null): void {
  token = t;
  if (typeof localStorage === "undefined") return;
  if (t) {
    localStorage.setItem(TOKEN_KEY, t);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getToken(): string | null {
  return token;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    setToken(null);
    throw new UnauthorizedError();
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data?.detail ?? detail;
    } catch {
      // response body wasn't JSON; fall back to statusText
    }
    throw new Error(detail || `Request failed with status ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
};

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/auth/login", { email, password });
  setToken(res.access_token);
  return res;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/auth/register", { email, password });
  setToken(res.access_token);
  return res;
}

export async function uploadReceipt(blob: Blob): Promise<UploadReceiptResponse> {
  const form = new FormData();
  form.append("file", blob, "receipt.jpg");

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}/receipts`, {
    method: "POST",
    headers,
    body: form,
  });

  if (res.status === 401) {
    setToken(null);
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    throw new Error(`Upload failed with status ${res.status}`);
  }
  return (await res.json()) as UploadReceiptResponse;
}

export function getReceipt(id: number | string): Promise<Receipt> {
  return api.get<Receipt>(`/receipts/${id}`);
}

export function confirmReceipt(
  id: number | string,
  data: ReceiptData,
): Promise<ConfirmReceiptResponse> {
  return api.put<ConfirmReceiptResponse>(`/receipts/${id}`, data);
}

export function listReceipts(): Promise<ReceiptListItem[]> {
  return api.get<ReceiptListItem[]>("/receipts");
}

export function listProducts(): Promise<Product[]> {
  return api.get<Product[]>("/products");
}

export function productPrices(id: number | string): Promise<PriceObservation[]> {
  return api.get<PriceObservation[]>(`/products/${id}/prices`);
}
