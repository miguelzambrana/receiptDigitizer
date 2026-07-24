import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

/** Top nav shown on authed screens (rendered by RequireAuth). */
export default function AppNav() {
  const { logout } = useAuth();

  return (
    <header className="app-nav">
      <nav className="app-nav-links">
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          Capture
        </NavLink>
        <NavLink
          to="/products"
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          Products
        </NavLink>
      </nav>
      <button type="button" className="app-nav-logout" onClick={logout}>
        Logout
      </button>
    </header>
  );
}
