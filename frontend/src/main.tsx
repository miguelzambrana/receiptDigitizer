import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./auth/AuthContext";
import LoginPage from "./auth/LoginPage";
import RequireAuth from "./components/RequireAuth";
import CapturePage from "./capture/CapturePage";
import ReviewPage from "./review/ReviewPage";
import ProductsPage from "./products/ProductsPage";
import PriceHistory from "./products/PriceHistory";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <div className="app-container">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <CapturePage />
                </RequireAuth>
              }
            />
            <Route
              path="/review/:id"
              element={
                <RequireAuth>
                  <ReviewPage />
                </RequireAuth>
              }
            />
            <Route
              path="/products"
              element={
                <RequireAuth>
                  <ProductsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/products/:id"
              element={
                <RequireAuth>
                  <PriceHistory />
                </RequireAuth>
              }
            />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
