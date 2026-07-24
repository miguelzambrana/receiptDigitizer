// Types mirror the backend API contract verbatim (see
// docs/superpowers/plans/2026-07-24-receipt-digitizer-frontend.md
// "## Backend API contract"). Do not add fields the backend doesn't send.

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface ItemData {
  raw_name: string;
  quantity: number | null;
  unit_price: number | null;
  total_price: number;
  is_discount: boolean;
  tax_class: string | null;
}

export interface ReceiptData {
  store: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  tax_id: string | null;
  date_text: string | null;
  currency: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total: number | null;
  items: ItemData[];
}

export interface Reconciliation {
  items_sum: number;
  expected_total: number | null;
  delta: number | null;
  matches: boolean;
}

export interface RawExtraction extends ReceiptData {
  reconciliation: Reconciliation;
  purchased_at: string | null;
}

export type ReceiptStatus = "processing" | "ready" | "failed" | "confirmed";

export interface UploadReceiptResponse {
  id: number;
  status: ReceiptStatus;
}

export interface Receipt {
  id: number;
  status: ReceiptStatus;
  source_engine: string | null;
  raw_extraction: RawExtraction | { error: string } | null;
  store_id: number | null;
  total: number | null;
  currency: string | null;
}

export interface ReceiptListItem {
  id: number;
  status: ReceiptStatus;
  store_id: number | null;
  total: number | null;
  currency: string | null;
  purchased_at: string | null;
}

export interface ConfirmReceiptResponse {
  id: number;
  status: "confirmed";
  store_id: number | null;
}

export interface Product {
  id: number;
  display_name: string;
  last_price: number | null;
  currency: string | null;
  observations: number;
}

export interface PriceObservation {
  store_id: number | null;
  price: number;
  currency: string;
  observed_at: string | null;
}
