import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Navbar() {
    const { user, token, logout } = useAuth();
    const nav = useNavigate();

    const handleLogout = () => {
        logout();
        nav("/login");
    };

    // Only render navbar if user is logged in
    if (!token) {
        return null;
    }

    return (
        <header className="topbar">
            <div
                className="brand"
                onClick={() => nav("/")}
                role="button"
                tabIndex={0}
                aria-label="Go to home"
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        nav("/");
                    }
                }}
            >
                Fragment3D
            </div>

            <nav className="navlinks" aria-label="Main navigation">
                <Link className="nav-item" to="/">Home</Link>
                <Link className="nav-item" to="/dashboard">My Objects</Link>
                <span
                    className="nav-item"
                    onClick={handleLogout}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            handleLogout();
                        }
                    }}
                >
                    Logout
                </span>
            </nav>
        </header>
    );
}
