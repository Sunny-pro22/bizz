// src/components/Inventory.jsx
import React, { useState, useEffect, useRef } from 'react';
import { fetchProducts, addInventory, sellInventory } from './api';
import VoiceInput from './VoiceInput';
import styles from './Inventory.module.css';

const Inventory = ({ language = "hi-IN" }) => {
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({ name: '', quantity: '', price: '' });
  const [sellProductData, setSellProductData] = useState({ name: '', quantity: '', price: '' });
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
      const server = err.response?.data?.details || err.serverMessage || err.message;
      setMessage({ type: 'error', text: server || 'Failed to load products' });
    } finally { setLoading(false); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.quantity || newProduct.price === '') {
      setMessage({ type: 'error', text: 'Please fill all fields' });
      voiceRef.current?.speak('Please fill all fields', language);
      return;
    }
    setLoading(true);
    try {
      const res = await addInventory({
        product: newProduct.name,
        quantity: Number(newProduct.quantity),
        price: Number(newProduct.price)
      });
      setNewProduct({ name: '', quantity: '', price: '' });
      setMessage({ type: 'success', text: res.message || 'Product added successfully' });
      voiceRef.current?.speak(`${newProduct.name} added successfully`, language);
      loadProducts();
    } catch (err) {
      const server = err.response?.data?.details || err.serverMessage || err.message;
      setMessage({ type: 'error', text: server || 'Failed to add product' });
      voiceRef.current?.speak(String(server || 'Failed to add product'), language);
    } finally { setLoading(false); }
  };

  const handleSell = async (e) => {
    e.preventDefault();
    if (!sellProductData.name || !sellProductData.quantity || sellProductData.price === '') {
      setMessage({ type: 'error', text: 'Please fill all fields' });
      voiceRef.current?.speak('Please fill all fields', language);
      return;
    }
    setLoading(true);
    try {
      const res = await sellInventory({
        product: sellProductData.name,
        quantity: Number(sellProductData.quantity),
        price: Number(sellProductData.price)
      });
      setSellProductData({ name: '', quantity: '', price: '' });
      setMessage({ type: 'success', text: res.message || 'Product sold successfully' });
      voiceRef.current?.speak(`${sellProductData.name} sold successfully`, language);
      loadProducts();
    } catch (err) {
      const server = err.response?.data?.details || err.serverMessage || err.message;
      setMessage({ type: 'error', text: server || 'Failed to sell product' });
      voiceRef.current?.speak(String(server || 'Failed to sell product'), language);
    } finally { setLoading(false); }
  };

  const handleVoiceCommand = async (cmd) => {
    // cmd: { action, product, quantity, price, source }
    if (!cmd || typeof cmd !== 'object' || !cmd.action) {
      setMessage({ type: 'error', text: 'Unknown or invalid voice command' });
      voiceRef.current?.speak('Unknown or invalid command', language);
      return;
    }

    const action = String(cmd.action).toLowerCase();
    const product = cmd.product;
    const quantity = Number(cmd.quantity || 0);
    const price = cmd.price === null ? null : Number(cmd.price);

    if (!product || !product.trim()) {
      setMessage({ type: 'error', text: 'Product name missing in command' });
      voiceRef.current?.speak('Product name missing', language);
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage({ type: 'error', text: 'Invalid quantity in command' });
      voiceRef.current?.speak('Invalid quantity', language);
      return;
    }

    if (price === null || price === undefined || !Number.isFinite(price)) {
      // backend currently requires price; ask user to manually enter price for now
      setMessage({ type: 'error', text: 'Price required. Please add price manually.' });
      voiceRef.current?.speak('Price required. Please add price manually.', language);
      return;
    }

    setLoading(true);
    try {
      if (action === 'add') {
        const res = await addInventory({ product: product.trim(), quantity, price });
        setMessage({ type: 'success', text: res.message || `Added ${quantity} ${product}` });
        voiceRef.current?.speak(`Added ${quantity} ${product}`, language);
      } else if (action === 'sell') {
        const res = await sellInventory({ product: product.trim(), quantity, price });
        setMessage({ type: 'success', text: res.message || `Sold ${quantity} ${product}` });
        voiceRef.current?.speak(`Sold ${quantity} ${product}`, language);
      } else {
        setMessage({ type: 'error', text: 'Unknown command action' });
        voiceRef.current?.speak('Unknown command action', language);
      }
      loadProducts();
    } catch (err) {
      const server = err.response?.data?.details || err.serverMessage || err.message;
      setMessage({ type: 'error', text: server || 'Failed to process voice command' });
      voiceRef.current?.speak(String(server || 'Failed to process voice command'), language);
    } finally {
      setLoading(false);
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
          <input
            type="text"
            placeholder="Product Name"
            value={newProduct.name}
            onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
            required
          />
          <input
            type="number"
            placeholder="Quantity"
            value={newProduct.quantity}
            onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })}
            required
            min="1"
          />
          <input
            type="number"
            placeholder="Cost Price (per unit)"
            value={newProduct.price}
            onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
            required
            min="0"
            step="0.01"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Adding...' : 'Add to Inventory'}
          </button>
        </form>

        <form onSubmit={handleSell} className={styles.form}>
          <h3>💰 Sell Product</h3>
          <input
            type="text"
            placeholder="Product Name"
            value={sellProductData.name}
            onChange={(e) => setSellProductData({ ...sellProductData, name: e.target.value })}
            required
          />
          <input
            type="number"
            placeholder="Quantity"
            value={sellProductData.quantity}
            onChange={(e) => setSellProductData({ ...sellProductData, quantity: e.target.value })}
            required
            min="1"
          />
          <input
            type="number"
            placeholder="Selling Price (per unit)"
            value={sellProductData.price}
            onChange={(e) => setSellProductData({ ...sellProductData, price: e.target.value })}
            required
            min="0"
            step="0.01"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Processing...' : 'Sell'}
          </button>
        </form>
      </div>

      <h3>📋 Current Stock</h3>
      <div className={styles.tableWrapper}>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Selling Price (₹)</th>
              <th>Cost Price (₹)</th>
              <th>Profit/Unit</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p._id}>
                <td>{p.name}</td>
                <td>{p.quantity}</td>
                <td>₹{Number(p.price || 0).toFixed(2)}</td>
                <td>₹{Number(p.cost || 0).toFixed(2)}</td>
                <td>₹{(Number(p.price || 0) - Number(p.cost || 0)).toFixed(2)}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center' }}>
                  No products in inventory
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Inventory;
