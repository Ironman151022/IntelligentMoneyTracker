import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/chat", label: "Chat", end: false },
  { to: "/evaluation", label: "Evaluation", end: false },
  { to: "/knowledge-graph", label: "Knowledge Graph", end: false },
] as const;

export function TopNav() {
  return (
    <header className="top-nav">
      <NavLink to="/" className="nav-brand" end>
        moni<span>Q</span>
      </NavLink>
      <nav className="nav-links" aria-label="Primary">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
