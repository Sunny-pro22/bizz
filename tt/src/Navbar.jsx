import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import styles from './Navbar.module.css';

const Navbar = ({ onLanguageChange }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.logo}>🛒 EchoBizz</div>
      <div className={styles.links}>
        {user ? (
          <>
            <Link to="/">Inventory</Link>
            <Link to="/profile">Profile</Link>
            <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/signup">Signup</Link>
          </>
        )}
      </div>
      {/* Language selector (optional) */}
      <select onChange={(e) => onLanguageChange(e.target.value)} className={styles.langSelect}>
        <option value="hi-IN">हिन्दी</option>
        <option value="en-IN">English</option>
      </select>
    </nav>
  );
};

export default Navbar;