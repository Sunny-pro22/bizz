import React, { useState, useEffect, useRef } from 'react';
import { fetchProducts, addProduct, sellProduct } from './api';
import VoiceInput from './VoiceInput';
import styles from './Inventory.module.css';

const Inventory = ({ language }) => {
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({ name: '', quantity: '', price: '' });
  const [sellProductData, setSellProductData] = useState({ name: '', quantity: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const voiceRef = useRef();

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const { data } = await fetchProducts();
      setProducts(data);
      setMessage({ type: '', text: '' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load products' });
    } finally { setLoading(false); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.quantity || !newProduct.price) {
      setMessage({ type: 'error', text: 'Please fill all fields' });
      voiceRef.current?.speak("Please fill all fields", language);
      return;
    }
    setLoading(true);
    try {
      await addProduct({ name: newProduct.name, quantity: Number(newProduct.quantity), price: Number(newProduct.price) });
      setNewProduct({ name: '', quantity: '', price: '' });
      setMessage({ type: 'success', text: 'Product added successfully' });
      voiceRef.current?.speak(`${newProduct.name} added successfully`, language);
      loadProducts();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to add product';
      setMessage({ type: 'error', text: errorMsg });
      voiceRef.current?.speak(errorMsg, language);
    } finally { setLoading(false); }
  };

  const handleSell = async (e) => {
    e.preventDefault();
    if (!sellProductData.name || !sellProductData.quantity) {
      setMessage({ type: 'error', text: 'Please fill all fields' });
      voiceRef.current?.speak("Please fill all fields", language);
      return;
    }
    setLoading(true);
    try {
      await sellProduct({ name: sellProductData.name, quantity: Number(sellProductData.quantity) });
      setSellProductData({ name: '', quantity: '' });
      setMessage({ type: 'success', text: 'Product sold successfully' });
      voiceRef.current?.speak(`${sellProductData.name} sold successfully`, language);
      loadProducts();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to sell product';
      setMessage({ type: 'error', text: errorMsg });
      voiceRef.current?.speak(errorMsg, language);
    } finally { setLoading(false); }
  };

  const handleVoiceCommand = async (cmd) => {
    if (cmd.action === 'add') {
      if (!cmd.price) {
        voiceRef.current?.speak("Price required for adding product", language);
        setMessage({ type: 'error', text: 'Price required' });
        return;
      }
      try {
        await addProduct({ name: cmd.product, quantity: cmd.quantity, price: cmd.price });
        setMessage({ type: 'success', text: `Added ${cmd.quantity} ${cmd.product}` });
        voiceRef.current?.speak(`Added ${cmd.quantity} ${cmd.product}`, language);
        loadProducts();
      } catch (err) {
        const errorMsg = err.response?.data?.error || 'Failed to add via voice';
        setMessage({ type: 'error', text: errorMsg });
        voiceRef.current?.speak(errorMsg, language);
      }
    } else if (cmd.action === 'sell') {
      try {
        await sellProduct({ name: cmd.product, quantity: cmd.quantity });
        setMessage({ type: 'success', text: `Sold ${cmd.quantity} ${cmd.product}` });
        voiceRef.current?.speak(`Sold ${cmd.quantity} ${cmd.product}`, language);
        loadProducts();
      } catch (err) {
        const errorMsg = err.response?.data?.error || 'Failed to sell via voice';
        setMessage({ type: 'error', text: errorMsg });
        voiceRef.current?.speak(errorMsg, language);
      }
    } else {
      voiceRef.current?.speak("Unknown command", language);
    }
  };

  return (
    <div className="container">
      <h2>📦 Inventory Management</h2>
      <VoiceInput ref={voiceRef} onCommand={handleVoiceCommand} lang={language} />
      {message.text && <div className={`${styles.message} ${styles[message.type]}`}>{message.text}</div>}

      <div className={styles.formsGrid}>
        <form onSubmit={handleAdd} className={styles.form}>
          <h3>➕ Add Product (Purchase)</h3>
          <input type="text" placeholder="Product Name" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} required />
          <input type="number" placeholder="Quantity" value={newProduct.quantity} onChange={e => setNewProduct({...newProduct, quantity: e.target.value})} required min="1" />
          <input type="number" placeholder="Cost Price (per unit)" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} required min="0" step="0.01" />
          <button type="submit" disabled={loading}>{loading ? 'Adding...' : 'Add to Inventory'}</button>
        </form>

        <form onSubmit={handleSell} className={styles.form}>
          <h3>💰 Sell Product</h3>
          <input type="text" placeholder="Product Name" value={sellProductData.name} onChange={e => setSellProductData({...sellProductData, name: e.target.value})} required />
          <input type="number" placeholder="Quantity" value={sellProductData.quantity} onChange={e => setSellProductData({...sellProductData, quantity: e.target.value})} required min="1" />
          <button type="submit" disabled={loading}>{loading ? 'Processing...' : 'Sell'}</button>
        </form>
      </div>

      <h3>📋 Current Stock</h3>
      <div className={styles.tableWrapper}>
        <table>
          <thead><tr><th>Product</th><th>Quantity</th><th>Selling Price (₹)</th><th>Cost Price (₹)</th><th>Profit/Unit</th></tr></thead>
          <tbody>
            {products.map(p => <tr key={p._id}><td>{p.name}</td><td>{p.quantity}</td><td>₹{p.price.toFixed(2)}</td><td>₹{p.cost.toFixed(2)}</td><td>₹{(p.price - p.cost).toFixed(2)}</td></tr>)}
            {products.length === 0 && <tr><td colSpan="5" style={{textAlign:'center'}}>No products in inventory</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Inventory;