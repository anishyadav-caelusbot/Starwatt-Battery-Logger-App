import React, { useState, useEffect } from 'react';
import { Cpu, Zap, Thermometer, Battery, ShieldAlert, ChevronRight, Edit3, Settings, Save, ChevronUp, ChevronDown } from 'lucide-react';

function Sparkline({ device, location }) {
  const [points, setPoints] = useState([]);

  useEffect(() => {
    const fetchSparkData = async () => {
      try {
        const response = await fetch(`/api/history?device=${device}&location=${location}&range=1h`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          const volts = data.map(d => d.Voltage).filter(v => typeof v === 'number');
          setPoints(volts);
        }
      } catch (err) {
        console.error('Error loading sparkline data:', err);
      }
    };

    fetchSparkData();
    const interval = setInterval(fetchSparkData, 30000);
    return () => clearInterval(interval);
  }, [device, location]);

  if (points.length < 2) {
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none">
        <path d="M 0 15 L 100 15" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      </svg>
    );
  }

  const width = 200;
  const height = 40;
  const min = Math.min(...points) - 0.05;
  const max = Math.max(...points) + 0.05;
  const range = max - min || 1;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  });

  const pathD = `M ${coords.join(' L ')}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-grad-${device}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-grad-${device})`} />
      <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const formatRunTime = (runVal) => {
  if (runVal === 'all') return 'all (No Filter)';
  if (runVal === '0' || Number(runVal) === 0) return '0 (Unassigned Run)';
  const num = Number(runVal);
  if (isNaN(num)) return runVal;
  
  const ms = num < 10000000000 ? num * 1000 : num;
  const date = new Date(ms);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

function Dashboard({ liveData, onEditDetails, onNavigateToAnalytics, filter, onSaveFilter, filterOptions }) {
  const [descriptions, setDescriptions] = useState({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterFields, setFilterFields] = useState({
    measurement: 'BatteryLogger',
    location: 'Starwatt-Lab',
    device: 'BatLog',
    testStartTime: '0'
  });
  const [filterSaveStatus, setFilterSaveStatus] = useState('idle');
  const [filterRuns, setFilterRuns] = useState(['0', 'all']);

  useEffect(() => {
    if (filter) {
      setFilterFields(filter);
    }
  }, [filter]);

  useEffect(() => {
    if (!filterFields.device || filterFields.device === 'all') {
      setFilterRuns(['all', '0']);
      return;
    }
    const fetchRunsForFilter = async () => {
      try {
        const res = await fetch(`/api/test-start-times?device=${filterFields.device}&location=${filterFields.location || 'all'}&measurement=${filterFields.measurement || 'BatteryLogger'}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const data = await res.json();
        setFilterRuns(['all', '0', ...data]);
      } catch (err) {
        console.error(err);
      }
    };
    fetchRunsForFilter();
  }, [filterFields.device, filterFields.location, filterFields.measurement]);

  const handleSaveFilterSubmit = async (e) => {
    e.preventDefault();
    setFilterSaveStatus('saving');
    const success = await onSaveFilter(filterFields);
    if (success) {
      setFilterSaveStatus('success');
      setTimeout(() => setFilterSaveStatus('idle'), 3000);
      setIsFilterOpen(false);
    } else {
      setFilterSaveStatus('error');
      setTimeout(() => setFilterSaveStatus('idle'), 4000);
    }
  };

  useEffect(() => {
    const descs = {};
    liveData.forEach(d => {
      descs[`${d.Location}_${d.Device}`] = d.testDetail || '';
    });
    setDescriptions(descs);
  }, [liveData]);

  const handleDescBlur = async (location, device, text) => {
    try {
      const response = await fetch('/api/details', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ location, device, text })
      });
      if (response.ok) {
        onEditDetails();
      }
    } catch (err) {
      console.error('Failed to save description:', err);
    }
  };

  const handleDescChange = (location, device, val) => {
    setDescriptions({
      ...descriptions,
      [`${location}_${device}`]: val
    });
  };

  const totalModules = liveData.length;
  const avgSoC = totalModules > 0 
    ? (liveData.reduce((acc, curr) => acc + (curr.SoC || 0), 0) / totalModules).toFixed(1) 
    : 0;
  const avgTemp = totalModules > 0 
    ? (liveData.reduce((acc, curr) => acc + (curr.Temperature || 0), 0) / totalModules).toFixed(1) 
    : 0;
  const activeChargers = liveData.filter(d => d.Status === 1).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Collapsible Filter Panel */}
      <div className={`filter-settings-panel ${isFilterOpen ? 'open' : ''}`} style={{ marginBottom: '0px' }}>
        <button 
          className="filter-toggle-btn" 
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          style={{
            width: '100%',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(30, 41, 59, 0.2)',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            cursor: 'pointer',
            textAlign: 'left',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}
        >
          <Settings size={16} />
          <span>{isFilterOpen ? 'Hide InfluxDB Filters' : 'Configure InfluxDB Filters'}</span>
          {isFilterOpen ? <ChevronUp size={16} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={16} style={{ marginLeft: 'auto' }} />}
        </button>
        
        {isFilterOpen && (
          <div className="filter-panel-content" style={{ padding: '20px', background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderTop: 'none', borderBottomLeftRadius: '14px', borderBottomRightRadius: '14px' }}>
            <form onSubmit={handleSaveFilterSubmit} className="filter-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="filter-inputs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="filterMeasurement" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>InfluxDB Measurement</label>
                  <select
                    id="filterMeasurement"
                    value={filterFields.measurement}
                    onChange={(e) => setFilterFields({ ...filterFields, measurement: e.target.value })}
                    className="form-input"
                    style={{ background: 'var(--bg-card)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '14px', width: '100%', height: '40px' }}
                  >
                    {filterOptions?.measurements?.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="filterLocation" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Location Tag</label>
                  <select
                    id="filterLocation"
                    value={filterFields.location}
                    onChange={(e) => setFilterFields({ ...filterFields, location: e.target.value })}
                    className="form-input"
                    style={{ background: 'var(--bg-card)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '14px', width: '100%', height: '40px' }}
                  >
                    <option value="all">all (No Filter)</option>
                    {filterOptions?.locations?.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="filterDevice" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Device Tag</label>
                  <select
                    id="filterDevice"
                    value={filterFields.device}
                    onChange={(e) => setFilterFields({ ...filterFields, device: e.target.value })}
                    className="form-input"
                    style={{ background: 'var(--bg-card)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '14px', width: '100%', height: '40px' }}
                  >
                    <option value="all">all (No Filter)</option>
                    {filterOptions?.devices?.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="filterTestStartTime" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Test Start Time</label>
                  <select
                    id="filterTestStartTime"
                    value={filterFields.testStartTime}
                    onChange={(e) => setFilterFields({ ...filterFields, testStartTime: e.target.value })}
                    className="form-input"
                    style={{ background: 'var(--bg-card)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '14px', width: '100%', height: '40px' }}
                  >
                    {filterRuns.map(run => (
                      <option key={run} value={run}>
                        {formatRunTime(run)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="filter-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={filterSaveStatus === 'saving'}
                >
                  <Save size={16} />
                  <span>{filterSaveStatus === 'saving' ? 'Saving Filter...' : 'Save & Apply Filter'}</span>
                </button>
                {filterSaveStatus === 'success' && (
                  <span className="save-success-badge" style={{ fontSize: '12px', fontWeight: '600', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>✓ Filter Applied & Saved</span>
                )}
                {filterSaveStatus === 'error' && (
                  <span className="save-error-badge" style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>✗ Connection Failed</span>
                )}
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Fleet Summary Banner */}
      <section className="stats-row">
        <div className="stat-card">
          <div className="stat-icon">
            <Cpu size={24} />
          </div>
          <div>
            <div className="stat-label">Active Modules</div>
            <div className="stat-val">{totalModules} Units</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Battery size={24} />
          </div>
          <div>
            <div className="stat-label">Average Fleet SoC</div>
            <div className="stat-val">{avgSoC}%</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Thermometer size={24} />
          </div>
          <div>
            <div className="stat-label">Average Cell Temp</div>
            <div className="stat-val">{avgTemp} °C</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Zap size={24} />
          </div>
          <div>
            <div className="stat-label">Units Charging</div>
            <div className="stat-val">{activeChargers} active</div>
          </div>
        </div>
      </section>

      {/* Grid of Device Telemetry Cards */}
      <section className="device-grid">
        {liveData.map((d) => {
          const isCharging = d.Status === 1;
          const isDischarging = d.Status === 2;
          const isFault = d.Status === 3;
          
          let statusLabel = 'Idle';
          let statusBadgeClass = 'badge-blue';
          let socClass = 'circle-val-green';
          
          if (isCharging) {
            statusLabel = d.ChargingPhase === 2 ? 'Charging (CV)' : 'Charging (CC)';
            statusBadgeClass = 'badge-green';
          } else if (isDischarging) {
            statusLabel = 'Discharging';
            statusBadgeClass = 'badge-amber';
          } else if (isFault) {
            statusLabel = 'Fault';
            statusBadgeClass = 'badge-red';
          }

          if (d.SoC < 20) socClass = 'circle-val-red';
          else if (d.SoC < 50) socClass = 'circle-val-amber';

          const radius = 42;
          const circumference = 2 * Math.PI * radius;
          const dashoffset = circumference - ((d.SoC || 0) / 100) * circumference;

          const detailKey = `${d.Location}_${d.Device}`;

          return (
            <div className="device-card" key={`${d.Location}_${d.Device}`}>
              {/* Header section */}
              <div className="device-card-header">
                <div>
                  <h3 className="device-name">{d.Device}</h3>
                  <div className="device-meta">
                    <span>{d.Location}</span>
                    <span>•</span>
                    <span>v{d.FirmwareVersion || '1.0.0'}</span>
                  </div>
                </div>
                <span className={`badge ${statusBadgeClass}`}>{d.Config || 'LFP'}</span>
              </div>

              {/* Circular Gauge and Core Stats */}
              <div className="soc-container">
                <div className="soc-radial">
                  <svg>
                    <circle className="circle-bg" cx="50" cy="50" r={radius} />
                    <circle 
                      className={`circle-val ${socClass}`} 
                      cx="50" 
                      cy="50" 
                      r={radius} 
                      strokeDasharray={circumference}
                      strokeDashoffset={dashoffset}
                    />
                  </svg>
                  <div className="soc-text-overlay">
                    <span>{d.SoC?.toFixed(1)}</span>
                    <span className="soc-subtext">SoC %</span>
                  </div>
                </div>

                <div className="quick-stats">
                  <div className="q-stat">
                    <span className="q-lbl">Volatge</span>
                    <div className="q-val" style={{ color: '#f8fafc' }}>
                      {d.Voltage?.toFixed(2)} V
                    </div>
                  </div>
                  <div className="q-stat">
                    <span className="q-lbl">Ampere</span>
                    <div className="q-val" style={{ 
                      color: isCharging ? '#10b981' : (isDischarging ? '#f59e0b' : '#f8fafc') 
                    }}>
                      {isDischarging ? '' : (d.Current > 0 ? '+' : '')}
                      {d.Current?.toFixed(3)} A
                    </div>
                  </div>
                  <div className="q-stat">
                    <span className="q-lbl">Power</span>
                    <div className="q-val" style={{ color: '#38bdf8' }}>
                      {d.Power?.toFixed(1)} W
                    </div>
                  </div>
                  <div className="q-stat">
                    <span className="q-lbl">Temp</span>
                    <div className="q-val">
                      {d.Temperature?.toFixed(1)} °C
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '6px', fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                <span>1-Hour Voltage Trend</span>
                <span>Live Sparkline</span>
              </div>
              <div className="sparkline-container">
                <Sparkline device={d.Device} location={d.Location} />
              </div>

              {/* Expanded parameter list featuring labels from battery_logger.json */}
              <div className="details-list">
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span className="detail-value" style={{ color: isCharging ? '#10b981' : (isDischarging ? '#f59e0b' : '#94a3b8') }}>
                    {statusLabel}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Charge mAh </span>
                  <span className="detail-value" style={{ color: '#10b981' }}>{d.ChargeDelivered?.toFixed(2)} mah</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Discharge MAh</span>
                  <span className="detail-value" style={{ color: '#f59e0b' }}>{d.DischargeDelivered?.toFixed(2)} mah</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Charge Time</span>
                  <span className="detail-value">{d.ChargingTime?.toFixed(1)} minutes</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Discharge Time</span>
                  <span className="detail-value">{d.DischargingTime?.toFixed(1)} minutes</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">State of Health (SoH)</span>
                  <span className="detail-value">{d.SoH || 100}%</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Internal Resistance</span>
                  <span className="detail-value">{d.InternalResistance?.toFixed(4)} Ω</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">C-Rate</span>
                  <span className="detail-value">{d.C_rate?.toFixed(3)} C</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">WiFi RSSI Strength</span>
                  <span className="detail-value" style={{ 
                    color: d.WiFiRSSI > -60 ? '#10b981' : (d.WiFiRSSI > -75 ? '#f59e0b' : '#ef4444') 
                  }}>
                    {d.WiFiRSSI} dBm
                  </span>
                </div>
              </div>

              {/* Editable Description Section */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Edit3 size={12} style={{ color: '#64748b' }} />
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Test Configuration Notes
                </span>
              </div>
              <textarea
                className="editable-desc"
                placeholder="Click here to write notes about this battery test (e.g. current profile, lab condition, setup info)..."
                rows="2"
                value={descriptions[detailKey] || ''}
                onChange={(e) => handleDescChange(d.Location, d.Device, e.target.value)}
                onBlur={(e) => handleDescBlur(d.Location, d.Device, e.target.value)}
              />

              <div className="device-card-footer">
                <button 
                  className="btn btn-sm btn-primary"
                  style={{ flexGrow: 1, justifyContent: 'center' }}
                  onClick={() => {
                    localStorage.setItem('selectedDevice', d.Device);
                    localStorage.setItem('selectedLocation', d.Location);
                    onNavigateToAnalytics();
                  }}
                >
                  <span>Analytics Charts</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

export default Dashboard;
