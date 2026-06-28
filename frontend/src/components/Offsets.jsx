import React, { useState, useEffect } from 'react';
import { Sliders, Save, CheckCircle, HelpCircle, Trash2, Database, ShieldAlert, Activity, RefreshCw } from 'lucide-react';

function Offsets({ liveData }) {
  // Offsets States
  const [offsets, setOffsets] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // InfluxDB Connection States
  const [dbConfig, setDbConfig] = useState({
    url: '',
    token: '',
    org: '',
    bucket: '',
    mockMode: false,
    hasToken: false
  });
  const [dbStatus, setDbStatus] = useState('idle'); // idle | testing | success | error
  const [dbErrorMsg, setDbErrorMsg] = useState('');

  // Fetch offsets and db configuration on mount
  useEffect(() => {
    const fetchOffsets = async () => {
      try {
        const response = await fetch('/api/offsets', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setOffsets(data);
        }
      } catch (err) {
        console.error('Failed to load offsets:', err);
      }
    };

    const fetchDbConfig = async () => {
      try {
        const response = await fetch('/api/db-config', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setDbConfig({
            url: data.url || '',
            token: '', // Keep token input empty for security
            org: data.org || '',
            bucket: data.bucket || '',
            mockMode: false,
            hasToken: data.hasToken
          });
        }
      } catch (err) {
        console.error('Failed to load DB config:', err);
      }
    };

    fetchOffsets();
    fetchDbConfig();
  }, []);

  // Handle offset changes
  const handleInputChange = (deviceKey, field, val) => {
    const numVal = val === '' ? 0 : parseFloat(val);
    setOffsets({
      ...offsets,
      [deviceKey]: {
        ...offsets[deviceKey],
        [field]: isNaN(numVal) ? 0 : numVal
      }
    });
  };

  const handleSaveOffsets = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/offsets', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(offsets)
      });
      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save offsets:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearOffsets = (deviceKey) => {
    setOffsets({
      ...offsets,
      [deviceKey]: {
        Voltage: 0,
        Current: 0,
        Power: 0,
        Temperature: 0,
        SoC: 0,
        SoH: 0
      }
    });
  };

  // Handle Database config changes
  const handleDbChange = (field, val) => {
    setDbConfig({
      ...dbConfig,
      [field]: val
    });
  };

  const handleSaveDbConfig = async (e) => {
    e.preventDefault();
    setDbStatus('testing');
    setDbErrorMsg('');

    try {
      const payload = {
        url: dbConfig.url,
        org: dbConfig.org,
        bucket: dbConfig.bucket,
        mockMode: false
      };
      
      // Only send token if the user typed a new one
      if (dbConfig.token) {
        payload.token = dbConfig.token;
      }

      const response = await fetch('/api/db-config', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setDbStatus('success');
        setDbConfig(prev => ({
          ...prev,
          token: '', // clear password input field
          hasToken: data.mode === 'live' ? true : prev.hasToken,
          mockMode: false
        }));
        setTimeout(() => setDbStatus('idle'), 4000);
      } else {
        setDbStatus('error');
        setDbErrorMsg(data.error || 'Failed to connect to InfluxDB.');
      }
    } catch (err) {
      console.error('Failed to save DB config:', err);
      setDbStatus('error');
      setDbErrorMsg('Network communication error with backend API.');
    }
  };

  const fields = [
    { key: 'Voltage', label: 'Voltage Offset', unit: 'V', step: '0.001' },
    { key: 'Current', label: 'Current Offset', unit: 'A', step: '0.0001' },
    { key: 'Power', label: 'Power Offset', unit: 'W', step: '0.1' },
    { key: 'Temperature', label: 'Temp Offset', unit: '°C', step: '0.1' },
    { key: 'SoC', label: 'SoC Offset', unit: '%', step: '0.5' },
    { key: 'SoH', label: 'SoH Offset', unit: '%', step: '0.5' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* SECTION 1: Database Connection Settings */}
      <div className="calibration-container">
        <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Database size={20} style={{ color: '#38bdf8' }} />
          <span>InfluxDB Server Configuration</span>
        </h2>

        {dbStatus === 'success' && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            color: 'var(--accent-green)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            marginBottom: '16px'
          }}>
            <CheckCircle size={18} />
            <span>Database configurations successfully validated and saved.</span>
          </div>
        )}

        {dbStatus === 'error' && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            color: 'var(--accent-red)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '14px',
            marginBottom: '16px'
          }}>
            <ShieldAlert size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <strong>Connection Test Failed:</strong>
              <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.9 }}>{dbErrorMsg}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveDbConfig}>
          <div className="filter-grid" style={{ marginBottom: '20px' }}>
            <div className="form-group">
              <label className="form-label">Database Host URL</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="http://host.docker.internal:8086"
                value={dbConfig.url} 
                onChange={(e) => handleDbChange('url', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                Access Token 
                {dbConfig.hasToken && <span style={{ color: '#10b981', fontSize: '10px', marginLeft: '6px' }}>(Configured ✓)</span>}
              </label>
              <input 
                type="password" 
                className="form-input" 
                placeholder={dbConfig.hasToken ? "••••••••••••••••••••" : "Paste InfluxDB Admin Token..."}
                value={dbConfig.token} 
                onChange={(e) => handleDbChange('token', e.target.value)}
                required={!dbConfig.hasToken}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Organization</label>
              <input 
                type="text" 
                className="form-input" 
                value={dbConfig.org} 
                onChange={(e) => handleDbChange('org', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Bucket Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={dbConfig.bucket} 
                onChange={(e) => handleDbChange('bucket', e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div></div>

            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={dbStatus === 'testing'}
            >
              {dbStatus === 'testing' ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Testing Connection...</span>
                </>
              ) : (
                <>
                  <Database size={16} />
                  <span>Save & Connect</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: Calibration Table */}
      <div style={{
        background: 'rgba(56, 189, 248, 0.05)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        borderRadius: '10px',
        padding: '16px 20px',
        fontSize: '14px',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}>
        <HelpCircle size={20} style={{ color: '#38bdf8', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>How Sensor Offsets Work:</strong>
          Calibration offsets are applied mathematically at the backend before returning data to the UI. 
          For example, if a voltage sensor has a wire drop of 0.05V, set the Voltage Offset to <code>+0.05</code>. 
          Formula: <code style={{ color: '#38bdf8' }}>CalibratedValue = RawValue + Offset</code>.
          Leave values at <code>0</code> for raw readings.
        </div>
      </div>

      {saveSuccess && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          color: 'var(--accent-green)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '14px'
        }}>
          <CheckCircle size={18} />
          <span>Calibration configurations successfully saved and deployed to live telemetry feed.</span>
        </div>
      )}

      <div className="calibration-container">
        <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sliders size={20} style={{ color: '#38bdf8' }} />
          <span>Sensor Output Calibration Offsets</span>
        </h2>

        <div className="table-responsive">
          <table className="calibration-table">
            <thead>
              <tr>
                <th>Battery Module Node</th>
                {fields.map(f => (
                  <th key={f.key} style={{ textAlign: 'right' }}>
                    {f.label} ({f.unit})
                  </th>
                ))}
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {liveData.map(device => {
                const key = `${device.Location}_${device.Device}`;
                const deviceOffsets = offsets[key] || {
                  Voltage: 0,
                  Current: 0,
                  Power: 0,
                  Temperature: 0,
                  SoC: 0,
                  SoH: 0
                };

                return (
                  <tr key={key}>
                    <td style={{ fontWeight: '600' }}>
                      <div style={{ fontSize: '14px' }}>{device.Device}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '400' }}>
                        {device.Location} ({device.Config})
                      </div>
                    </td>
                    
                    {fields.map(f => (
                      <td key={f.key} style={{ textAlign: 'right' }}>
                        <input
                          type="number"
                          step={f.step}
                          className="form-input input-offset"
                          value={deviceOffsets[f.key] !== undefined ? deviceOffsets[f.key] : ''}
                          onChange={(e) => handleInputChange(key, f.key, e.target.value)}
                          placeholder="0"
                        />
                      </td>
                    ))}

                    <td style={{ textAlign: 'center' }}>
                      <button 
                        type="button"
                        className="btn btn-sm" 
                        title="Reset this node to 0"
                        onClick={() => handleClearOffsets(key)}
                        style={{ border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--accent-red)' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {liveData.length === 0 && (
                <tr>
                  <td colSpan={fields.length + 2} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                    No active battery modules found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button 
            type="button"
            className="btn btn-primary"
            onClick={handleSaveOffsets}
            disabled={isSaving}
          >
            <Save size={16} />
            <span>{isSaving ? 'Saving Calibration...' : 'Save & Calibrate'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Offsets;
