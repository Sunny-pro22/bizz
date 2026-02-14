import React, { useState, useEffect } from 'react';
import { fetchProfile, fetchTransactions } from './api';
import styles from './Profile.module.css';

const Profile = () => {
  const [profile, setProfile] = useState({ totalSales: 0, totalExpenses: 0, totalProfit: 0 });
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProfile();
    loadTransactions();
  }, []);

  const loadProfile = async () => {
    try {
      const { data } = await fetchProfile();
      setProfile(data);
    } catch (err) { console.error(err); }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const { data } = await fetchTransactions();
      setTransactions(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const filtered = transactions.filter(t => filter === 'all' ? true : t.type === filter);

  return (
    <div className="container">
      <h2>📊 Profile & Summary</h2>
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.sales}`}>
          <h3>Total Sales</h3>
          <p className={styles.statValue}>₹{profile.totalSales.toFixed(2)}</p>
        </div>
        <div className={`${styles.statCard} ${styles.expenses}`}>
          <h3>Total Expenses</h3>
          <p className={styles.statValue}>₹{profile.totalExpenses.toFixed(2)}</p>
        </div>
        <div className={`${styles.statCard} ${styles.profit}`}>
          <h3>Total Profit</h3>
          <p className={styles.statValue}>₹{profile.totalProfit.toFixed(2)}</p>
        </div>
      </div>

      <div className={styles.transactionsHeader}>
        <h3>📜 Transaction History</h3>
        <div className={styles.filterButtons}>
          <button className={`${styles.filterBtn} ${filter === 'all' ? styles.active : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`${styles.filterBtn} ${filter === 'add' ? styles.active : ''}`} onClick={() => setFilter('add')}>Purchases</button>
          <button className={`${styles.filterBtn} ${filter === 'sell' ? styles.active : ''}`} onClick={() => setFilter('sell')}>Sales</button>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table>
          <thead><tr><th>Type</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Date</th></tr></thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t._id}>
                <td><span className={`${styles.badge} ${styles[t.type]}`}>{t.type === 'add' ? 'Purchase' : 'Sale'}</span></td>
                <td>{t.productName}</td>
                <td>{t.quantity}</td>
                <td>₹{t.price.toFixed(2)}</td>
                <td>₹{t.total.toFixed(2)}</td>
                <td>{new Date(t.date).toLocaleDateString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan="6" style={{textAlign:'center'}}>No transactions</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Profile;