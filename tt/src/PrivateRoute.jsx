import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-spinner">Loading...</div>; // Customize as needed
  }

  return user ? children : <Navigate to="/login" />;
};

export default PrivateRoute;