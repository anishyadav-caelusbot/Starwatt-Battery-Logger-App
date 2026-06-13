import React, { useState, useEffect } from 'react';
import { LayoutDashboard, AreaChart, Sliders, Info, ShieldAlert, Cpu, Activity, RefreshCw } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import Offsets from './components/Offsets';
import Login from './components/Login';

// Lightweight, URL path-based SPA router
function usePathRouting(defaultPath = '/home') {
  const getInitialPath = () => {
    const p = window.location.pathname;
    return p === '/' ? defaultPath : p;
  };

  const [currentPath, setCurrentPath] = useState(getInitialPath());

  useEffect(() => {
    if (window.location.pathname === '/') {
      window.history.replaceState(null, '', defaultPath);
    }

    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [defaultPath]);

  const navigate = (path) => {
    window.history.pushState(null, '', path);
    setCurrentPath(path);
  };

  return [currentPath, navigate];
}

function App() {
  const [currentPath, navigate] = usePathRouting('/home');
  const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem('isLoggedIn') === 'true');
  const [devices, setDevices] = useState([]);
  const [liveData, setLiveData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch unique devices from backend
  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/devices', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch devices');
      const data = await response.json();
      setDevices(data);
    } catch (err) {
      console.error('Error fetching devices:', err);
    }
  };

  // Fetch live telemetry for all devices
  const fetchLiveTelemetry = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/live', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch live telemetry');
      const data = await response.json();
      setLiveData(data);
      setLastRefreshed(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching live data:', err);
      setError('Telemetry server offline. Showing simulated offline readings.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchDevices();
      fetchLiveTelemetry();

      // Auto-refresh live data every 10 seconds
      const interval = setInterval(() => {
        fetchLiveTelemetry();
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return <Login onLoginSuccess={() => setIsLoggedIn(true)} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <Activity size={28} className="text-accent-blue" style={{ color: '#38bdf8' }} />
          <span className="logo-text">STARWATT</span>
        </div>

        <nav className="nav-links">
          <div 
            className={`nav-item ${currentPath === '/home' ? 'active' : ''}`}
            onClick={() => navigate('/home')}
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </div>

          <div 
            className={`nav-item ${currentPath === '/analytics' ? 'active' : ''}`}
            onClick={() => navigate('/analytics')}
          >
            <AreaChart size={20} />
            <span>Analytics</span>
          </div>

          <div 
            className={`nav-item ${currentPath === '/calibration' ? 'active' : ''}`}
            onClick={() => navigate('/calibration')}
          >
            <Sliders size={20} />
            <span>Calibration</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="status-indicator" style={{ marginBottom: '12px' }}>
            <span className={`dot ${error ? 'dot-amber' : 'dot-green'}`}></span>
            <span>{error ? 'Degraded (Simulated)' : 'Live Telemetry Active'}</span>
          </div>
          <button 
            className="btn btn-sm" 
            style={{ 
              width: '100%', 
              justifyContent: 'center', 
              marginBottom: '10px', 
              borderColor: 'rgba(239, 68, 68, 0.3)', 
              color: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.05)'
            }}
            onClick={() => {
              localStorage.removeItem('isLoggedIn');
              localStorage.removeItem('authToken');
              setIsLoggedIn(false);
            }}
          >
            <span>Log Out</span>
          </button>
          <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
            Port: 80 (Nginx) | Host: InfluxDB
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="main-content">
        <header className="header">
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '800' }}>
              {currentPath === '/home' && 'Battery Fleet Dashboard'}
              {currentPath === '/analytics' && 'Station Analytics & Charts'}
              {currentPath === '/calibration' && 'Sensor Calibration Offsets'}
            </h1>
            <p className="title-desc">
              {currentPath === '/home' && 'Live status and core health indexes for all connected hardware modules.'}
              {currentPath === '/analytics' && 'Detailed historical charts for all 24 parameters with custom range queries.'}
              {currentPath === '/calibration' && 'Apply permanent digital offsets to adjust voltage, current, and temperature probes.'}
            </p>
          </div>

          <div className="controls-bar">
            {lastRefreshed && (
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                Refreshed: {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <button 
              className="btn btn-primary"
              disabled={isRefreshing}
              onClick={fetchLiveTelemetry}
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {error && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            color: '#f59e0b',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px'
          }}>
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Content Views */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', gap: '12px' }}>
            <RefreshCw size={24} className="animate-spin" style={{ color: '#38bdf8' }} />
            <span>Loading telemetry data...</span>
          </div>
        ) : (
          <>
            {currentPath === '/home' && (
              <Dashboard 
                liveData={liveData} 
                onEditDetails={fetchLiveTelemetry} 
                onNavigateToAnalytics={() => navigate('/analytics')} 
              />
            )}
            {currentPath === '/analytics' && (
              <Analytics 
                devices={devices} 
              />
            )}
            {currentPath === '/calibration' && (
              <Offsets 
                liveData={liveData}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
