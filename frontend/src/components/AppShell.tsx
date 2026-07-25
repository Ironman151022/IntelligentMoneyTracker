import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import "../styles/layout.css";

export function AppShell() {
  return (
    <div className="shell">
      <TopNav />
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
