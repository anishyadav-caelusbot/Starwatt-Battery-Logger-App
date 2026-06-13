import React, { useState } from 'react';
import { Activity, Lock, User, ShieldAlert } from 'lucide-react';

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('isLoggedIn', 'true');
        onLoginSuccess();
      } else {
        setError(data.error || 'Invalid username or password. Please try again.');
        setLoading(false);
      }
    } catch (err) {
      setError('Cannot contact authentication server.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      width: '100vw',
      position: 'fixed',
      top: 0,
      left: 0,
      backgroundColor: '#0a0f1d',
      backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.05), transparent 60%)',
      zIndex: 9999
    }}>
      <div className="chart-card" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '40px',
        background: 'rgba(30, 41, 59, 0.45)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        boxShadow: 'var(--glow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        {/* Logo Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '12px',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            boxShadow: 'var(--glow-blue)'
          }}>
            <Activity size={32} style={{ color: '#38bdf8' }} />
          </div>
          <h2 style={{
            fontSize: '24px',
            fontWeight: '800',
            letterSpacing: '2px',
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-green))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginTop: '8px'
          }}>
            STARWATT LABS
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Battery Telemetry & Calibration Panel
          </p>
        </div>

        {/* Error Callout */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '12px',
            color: 'var(--accent-red)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px'
          }}>
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={12} />
              <span>Username</span>
            </label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              style={{
                backgroundColor: 'rgba(10, 15, 29, 0.5)',
                border: '1px solid var(--border-color)',
                padding: '12px 14px 12px 14px'
              }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={12} />
              <span>Password</span>
            </label>
            <input
              type="password"
              required
              className="form-input"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              style={{
                backgroundColor: 'rgba(10, 15, 29, 0.5)',
                border: '1px solid var(--border-color)',
                padding: '12px 14px 12px 14px'
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              marginTop: '10px',
              padding: '12px',
              justifyContent: 'center',
              width: '100%',
              fontSize: '15px'
            }}
          >
            {loading ? 'Authenticating Credentials...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
