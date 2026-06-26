import { NavLink, useNavigate } from 'react-router-dom';

export default function NavBar() {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem('zh_token');
    navigate('/login');
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        ZH <span>Agent</span>
      </div>

      <NavLink to="/" end className="nav-link">
        Dashboard
      </NavLink>
      <NavLink to="/history" className="nav-link">
        History
      </NavLink>
      <NavLink to="/settings" className="nav-link">
        Settings
      </NavLink>

      <div className="spacer" />

      <button className="btn-ghost" onClick={logout}>
        Log out
      </button>
    </aside>
  );
}
