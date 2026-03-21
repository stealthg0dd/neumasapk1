import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function NavBar() {
  const { clearAuth } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function handleLogout() {
    clearAuth();
    navigate("/login", { replace: true });
  }

  function navClass(path: string) {
    return "nav-link" + (pathname === path ? " nav-link-active" : "");
  }

  return (
    <nav className="navbar">
      <span className="navbar-brand">Neumas</span>
      <div className="nav-links">
        <Link to="/" className={navClass("/")}>
          Dashboard
        </Link>
        <Link to="/scan" className={navClass("/scan")}>
          Scan
        </Link>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
        Sign out
      </button>
    </nav>
  );
}
