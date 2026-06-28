import React, { useState, useEffect } from 'react';
import { Plot, newTable } from '@influxdata/giraffe';
import {
  Zap, Activity, Cpu, Thermometer, Battery, BatteryMedium, Heart, Gauge,
  RefreshCw, TrendingUp, Clock, Timer, Hourglass, Percent, ChevronUp,
  ChevronDown, Mountain, Wifi, Code, Info, ArrowUpRight, ArrowDownRight,
  Database, ShieldCheck, Settings, Save, AlertTriangle, ArrowUp, ArrowDown, CheckCircle, Wind
} from 'lucide-react';
import './LiveTelemetry.css';

// Color interpolation helpers for rendering smooth canvas gradients
const hexToRgb = (hex) => {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

const rgbToHex = (r, g, b) => {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

const interpolateColors = (colors, steps) => {
  const ramp = [];
  const segments = colors.length - 1;
  const stepsPerSegment = Math.floor(steps / segments);
  
  for (let i = 0; i < segments; i++) {
    const startRgb = hexToRgb(colors[i]);
    const endRgb = hexToRgb(colors[i + 1]);
    const segmentSteps = (i === segments - 1) ? (steps - ramp.length) : stepsPerSegment;
    
    for (let j = 0; j < segmentSteps; j++) {
      const t = j / segmentSteps;
      const r = Math.round(startRgb[0] + (endRgb[0] - startRgb[0]) * t);
      const g = Math.round(startRgb[1] + (endRgb[1] - startRgb[1]) * t);
      const b = Math.round(startRgb[2] + (endRgb[2] - startRgb[2]) * t);
      ramp.push(rgbToHex(r, g, b));
    }
  }
  
  if (ramp.length > 0) {
    ramp[ramp.length - 1] = colors[colors.length - 1];
  }
  return ramp;
};

// Wrapper around @influxdata/giraffe Plot component for Gauges
const SvgGauge = ({ title, value, min: defaultMin, max: defaultMax, unit, colors, valueColor }) => {
  const currentVal = value !== undefined && value !== null ? value : 0;
  
  // Determine dynamic min and max based on current value to scale the gauge auto-adjustably
  let min = defaultMin;
  let max = defaultMax;
  
  if (currentVal > max) {
    max = Math.ceil(currentVal * 1.15);
  }
  if (currentVal < min) {
    min = Math.floor(currentVal * 1.15);
  }
  
  // Ensure max is strictly greater than min
  if (max <= min) {
    max = min + 1;
  }

  // Determine active color based on value thresholds
  let activeColor = colors[colors.length - 1]; // default fallback
  
  const titleLower = title.toLowerCase();
  if (titleLower.includes('voltage')) {
    if (currentVal < 10.5 || currentVal > 15.0) {
      activeColor = '#ef4444'; // Red for under/over voltage
    } else if (currentVal < 11.5 || currentVal > 14.5) {
      activeColor = '#f59e0b'; // Amber warning
    } else {
      activeColor = '#06b6d4'; // Cyan normal
    }
  } else if (titleLower.includes('current')) {
    const absVal = Math.abs(currentVal);
    if (absVal > 25.0) {
      activeColor = '#ef4444'; // Red alert
    } else if (absVal > 18.0) {
      activeColor = '#f59e0b'; // Amber warning
    } else {
      activeColor = '#10b981'; // Green normal
    }
  } else if (titleLower.includes('power')) {
    const absVal = Math.abs(currentVal);
    if (absVal > 400.0) {
      activeColor = '#ef4444'; // Red alert
    } else if (absVal > 280.0) {
      activeColor = '#f59e0b'; // Amber warning
    } else {
      activeColor = '#a855f7'; // Purple normal
    }
  }

  // Generate 40 smoothly blending colors to simulate a diffused gradient
  const interpolatedRamp = interpolateColors(colors, 40);

  // Giraffe expects data to be formatted in a Table matching the reference
  const table = newTable(1)
    .addColumn("_time", "dateTime:RFC3339", "time", [1])
    .addColumn("_value", "system", "number", [currentVal]);

  const config = {
    table: table,
    layers: [
      {
        type: "gauge",
        x: "_time",
        y: "_value",
        suffix: ` ${unit}`,
        gaugeSize: 4.6,
        decimalPlaces: {
          isEnforced: true,
          digits: 2,
        },
        gaugeColors: interpolatedRamp.map((c, i) => {
          let type = "threshold";
          if (i === 0) type = "min";
          else if (i === interpolatedRamp.length - 1) type = "max";
          
          return {
            id: (i + 1).toString(),
            type: type,
            hex: c,
            name: (i + 1).toString(),
            value: min + (i / (interpolatedRamp.length - 1)) * (max - min)
          };
        }),
        gaugeTheme: {
          valuePositionYOffset: 0.9,
          valueColor: activeColor,
          lineCount: 5,
          smallLineCount: 5,
        },
      },
    ],
  };

  const customClass = `svg-gauge-card giraffe-gauge-card gauge-theme-${titleLower.replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div className={customClass} style={{ width: '100%', minWidth: '360px', height: '260px', display: 'flex', flexDirection: 'column' }}>
      <div className="gauge-header" style={{ marginBottom: '4px', zIndex: 2 }}>
        <span className="gauge-label" style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{title}</span>
      </div>
      <div className="giraffe-plot-wrapper" style={{ width: '100%', height: '220px', margin: '0px', overflow: 'hidden' }}>
        <Plot config={config} />
      </div>
    </div>
  );
};

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

const ParamCard = ({ title, value, unit, icon: Icon, color, children, className }) => (
  <div className={`param-tile ${className || ''}`}>
    <div className="param-header">
      <span className="param-title">{title}</span>
      {Icon && <Icon size={16} style={{ color: color || 'var(--text-secondary)' }} />}
    </div>
    <div className="param-value-container">
      <span className="param-value">
        {value !== undefined && value !== null ? value : '--'}
      </span>
      {unit && <span className="param-unit">{unit}</span>}
    </div>
    <div className="param-content">
      {children}
    </div>
  </div>
);

const LiveTelemetry = ({ devices, filter, onSaveFilter, filterOptions }) => {
  const getInitialDeviceAndRun = () => {
    const params = new URLSearchParams(window.location.search);
    const dev = params.get('device') || '';
    const loc = params.get('location') || '';
    const run = params.get('run') || 'live';
    return { dev, loc, run };
  };

  const initialParams = getInitialDeviceAndRun();
  const [selectedDevice, setSelectedDevice] = useState(initialParams.dev);
  const [selectedLocation, setSelectedLocation] = useState(initialParams.loc);
  const [testRuns, setTestRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(initialParams.run);
  const [telemetryData, setTelemetryData] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [blink, setBlink] = useState(false);
  const [lastReceivedTime, setLastReceivedTime] = useState(0);

  // Set offline if no new telemetry was received within 15 seconds
  useEffect(() => {
    if (selectedRun !== 'live') {
      setIsOnline(false);
      return;
    }
    const checkOnline = () => {
      if (Date.now() - lastReceivedTime > 15000) {
        setIsOnline(false);
      } else {
        setIsOnline(true);
      }
    };
    
    checkOnline();
    const interval = setInterval(checkOnline, 5000);
    return () => clearInterval(interval);
  }, [lastReceivedTime, selectedRun]);
  
  // Filter settings panel states
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterFields, setFilterFields] = useState({
    measurement: 'BatteryLogger',
    location: 'Starwatt-Lab',
    device: 'BatLog',
    testStartTime: '0'
  });
  const [filterSaveStatus, setFilterSaveStatus] = useState('idle'); // idle | saving | success | error
  const [filterRuns, setFilterRuns] = useState(['0', 'all']);

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

  // Sync internal filter inputs with global filter state
  useEffect(() => {
    if (filter) {
      setFilterFields(filter);
    }
  }, [filter]);

  // Auto-select first device or filter matched device
  useEffect(() => {
    if (devices.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const urlDev = params.get('device');
      const urlLoc = params.get('location');
      
      if (urlDev && urlLoc) {
        setSelectedDevice(urlDev);
        setSelectedLocation(urlLoc);
      } else {
        const match = devices.find(d => d.device === filter.device && d.location === filter.location);
        if (match) {
          setSelectedDevice(match.device);
          setSelectedLocation(match.location);
        } else {
          setSelectedDevice(devices[0].device);
          setSelectedLocation(devices[0].location);
        }
      }
    }
  }, [devices, filter]);

  // Sync selected device and selected run to URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    
    if (selectedDevice && params.get('device') !== selectedDevice) {
      params.set('device', selectedDevice);
      changed = true;
    }
    if (selectedLocation && params.get('location') !== selectedLocation) {
      params.set('location', selectedLocation);
      changed = true;
    }
    if (selectedRun && params.get('run') !== selectedRun) {
      params.set('run', selectedRun);
      changed = true;
    }
    
    if (changed) {
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, [selectedDevice, selectedLocation, selectedRun]);

  // Fetch unique test runs when device changes
  useEffect(() => {
    if (!selectedDevice || !selectedLocation) return;
    const fetchRuns = async () => {
      try {
        const res = await fetch(`/api/test-start-times?device=${selectedDevice}&location=${selectedLocation}&measurement=${filter.measurement}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const data = await res.json();
        setTestRuns(data);
      } catch (err) {
        console.error('Failed to fetch test runs', err);
      }
    };
    fetchRuns();
  }, [selectedDevice, selectedLocation, filter.measurement]);

  // Main data fetching logic (1-second updates for live stream)
  useEffect(() => {
    if (!selectedDevice || !selectedLocation) return;

    let intervalId;

    const fetchData = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` };

        if (selectedRun === 'live') {
          // Fetch live endpoint with filter details
          const liveRes = await fetch(`/api/live?device=${selectedDevice}&location=${selectedLocation}&measurement=${filter.measurement}`, { headers });
          const liveArr = await liveRes.json();
          const targetLive = liveArr.find(d => d.Device === selectedDevice && d.Location === selectedLocation);
          if (targetLive) {
            setTelemetryData(targetLive);
            setLastReceivedTime(Date.now());
            setBlink(true);
            setTimeout(() => setBlink(false), 250);
          }
        } else {
          // Fetch specific offline run history and use final record
          const historyRes = await fetch(`/api/history?device=${selectedDevice}&location=${selectedLocation}&range=custom&start=-30d&end=now()&testStartTime=${selectedRun}&measurement=${filter.measurement}`, { headers });
          const historyArr = await historyRes.json();
          if (historyArr.length > 0) {
            setTelemetryData(historyArr[historyArr.length - 1]);
            setLastReceivedTime(Date.now());
            setBlink(true);
            setTimeout(() => setBlink(false), 250);
          }
        }
      } catch (err) {
        console.error('Failed to fetch telemetry data', err);
      }
    };

    fetchData();

    if (selectedRun === 'live') {
      intervalId = setInterval(fetchData, 1000); // 1-second high-frequency updates!
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [selectedDevice, selectedLocation, selectedRun, filter]);

  const handleDeviceChange = (e) => {
    const val = e.target.value;
    const [dev, loc] = val.split('|');
    setSelectedDevice(dev);
    setSelectedLocation(loc);
    setSelectedRun('live'); // reset to live on device change
  };

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

  const getStatusText = (status) => {
    switch (status) {
      case 1: return { text: 'Charging', class: 'status-charging', color: '#10b981' };
      case 2: return { text: 'Discharging', class: 'status-discharging', color: '#f59e0b' };
      case 3: return { text: 'Fault', class: 'status-fault', color: '#ef4444' };
      default: return { text: 'Idle', class: 'status-idle', color: '#64748b' };
    }
  };

  const statusInfo = getStatusText(telemetryData?.Status);

  // Dynamic voltage range mapping for gauges
  const maxVoltageLimit = telemetryData?.Config?.includes('8S') 
    ? 32 
    : (telemetryData?.Config?.includes('13S') ? 60 : 16);

  const maxPowerLimit = maxVoltageLimit * 30;
  const signedPower = telemetryData?.Power !== undefined 
    ? (telemetryData.Current < 0 ? -Math.abs(telemetryData.Power) : Math.abs(telemetryData.Power)) 
    : 0;

  // Helper to render Wifi RSSI bars
  const renderWifiSignalBars = (rssi) => {
    if (rssi === undefined) return '--';
    let barsCount = 0;
    if (rssi > -60) barsCount = 4;
    else if (rssi > -70) barsCount = 3;
    else if (rssi > -80) barsCount = 2;
    else if (rssi > -90) barsCount = 1;
    
    return (
      <div className="wifi-signal-wrapper">
        <div className="signal-bars">
          {[1, 2, 3, 4].map(idx => (
            <div 
              key={idx} 
              className={`signal-bar ${idx <= barsCount ? 'filled' : ''}`}
            />
          ))}
        </div>
        <span className="rssi-text">{rssi} dBm</span>
      </div>
    );
  };

  return (
    <div className="live-telemetry-container">
      
      {/* 1. Expandable filter panel */}
      <div className={`filter-settings-panel ${isFilterOpen ? 'open' : ''}`}>
        <button 
          className="filter-toggle-btn" 
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          id="toggleFilterBtn"
        >
          <Settings size={16} />
          <span>{isFilterOpen ? 'Hide InfluxDB Filters' : 'Configure InfluxDB Filters'}</span>
          {isFilterOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {isFilterOpen && (
          <div className="filter-panel-content">
            <form onSubmit={handleSaveFilterSubmit} className="filter-form">
              <div className="filter-inputs-grid">
                <div className="form-group">
                  <label htmlFor="filterMeasurement">InfluxDB Measurement</label>
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
                <div className="form-group">
                  <label htmlFor="filterLocation">Location Tag</label>
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
                <div className="form-group">
                  <label htmlFor="filterDevice">Device Tag</label>
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
                <div className="form-group">
                  <label htmlFor="filterTestStartTime">Test Start Time</label>
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
              <div className="filter-actions">
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={filterSaveStatus === 'saving'}
                >
                  <Save size={16} />
                  <span>{filterSaveStatus === 'saving' ? 'Saving Filter...' : 'Save & Apply Filter'}</span>
                </button>
                {filterSaveStatus === 'success' && (
                  <span className="save-success-badge">✓ Filter Applied & Saved</span>
                )}
                {filterSaveStatus === 'error' && (
                  <span className="save-error-badge">✗ Connection Failed</span>
                )}
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Selector and Custom Control Strip */}
      <div className="telemetry-controls-bar">
        <div className="selector-group">
          <div className="custom-select-wrapper">
            <label>Selected Hardware Module</label>
            <select className="custom-select" value={`${selectedDevice}|${selectedLocation}`} onChange={handleDeviceChange}>
              {devices.length === 0 ? (
                <option value={`${filter.device}|${filter.location}`}>{filter.location} / {filter.device}</option>
              ) : (
                devices.map(d => (
                  <option key={`${d.device}|${d.location}`} value={`${d.device}|${d.location}`}>
                    {d.location} / {d.device}
                  </option>
                ))
              )}
            </select>
          </div>
          
          <div className="custom-select-wrapper">
            <label>Filter Test Run (Test Start Time)</label>
            <select className="custom-select" value={selectedRun} onChange={(e) => setSelectedRun(e.target.value)}>
              <option value="live">Live Stream (Real-Time 1s)</option>
              {testRuns.map(run => (
                <option key={run} value={run}>
                  {formatRunTime(run)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="deck-badge active-run">
          <Database size={16} />
          <span>{selectedRun === 'live' ? 'STREAMING ACTIVE' : 'HISTORIC RUN MODE'}</span>
        </div>
      </div>

      {/* Metadata Status Deck */}
      <div className="status-deck">
        <div className="deck-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span 
            className={`led-dot ${isOnline ? 'online' : 'offline'} ${blink ? 'blink-active' : ''}`}
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: isOnline ? '#10b981' : '#64748b',
              boxShadow: isOnline 
                ? (blink ? '0 0 10px 4px rgba(16, 185, 129, 0.8)' : '0 0 4px 1px rgba(16, 185, 129, 0.4)')
                : '0 0 4px 1px rgba(100, 116, 139, 0.4)',
              transition: 'all 0.1s ease-out'
            }}
          />
          <span style={{ fontWeight: '800', fontSize: '11px', color: isOnline ? '#10b981' : '#64748b' }}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <div className={`deck-badge ${statusInfo.class || 'idle'}`}>
          <Activity size={16} style={{ color: statusInfo.color }} />
          <span>Status: {statusInfo.text}</span>
        </div>
        <div className="deck-badge">
          <Zap size={16} style={{ color: 'var(--accent-blue)' }} />
          <span>Profile: {telemetryData?.Config || '--'}</span>
        </div>
        <div className="deck-badge">
          <Code size={16} style={{ color: 'var(--text-secondary)' }} />
          <span>Firmware: {telemetryData?.FirmwareVersion || '1.0.0'}</span>
        </div>
        {telemetryData?.TestStartTime > 0 && (
          <div className="deck-badge">
            <Clock size={16} style={{ color: 'var(--accent-yellow)' }} />
            <span>Epoch: {telemetryData.TestStartTime}</span>
          </div>
        )}
        <div className="deck-badge" style={{ marginLeft: 'auto' }}>
          <ShieldCheck size={16} style={{ color: 'var(--accent-green)' }} />
          <span>Subsystems Nominal</span>
        </div>
      </div>

      {/* CATEGORY 1: VAW POWER HUB (Combined Widget) */}
      <div className="combined-widget vaw-hub-widget" style={{ marginBottom: '24px' }}>
        <div className="widget-header">
          <Zap size={18} className="widget-icon" />
          <h3 className="widget-title">VAW Power Cluster (Voltage - Amperage - Wattage)</h3>
        </div>
        
        <div className="vaw-layout">
          {/* Voltage Gauge */}
          <SvgGauge
            title="Voltage Output"
            value={telemetryData?.Voltage}
            min={0}
            max={maxVoltageLimit}
            unit="V"
            colors={['#06b6d4', '#10b981']}
            valueColor="#38bdf8"
          />

          {/* Current Gauge */}
          <SvgGauge
            title="Current Flow"
            value={telemetryData?.Current}
            min={-30}
            max={30}
            unit="A"
            colors={['#10b981', '#f59e0b']}
            valueColor="#10b981"
          />

          {/* Power Gauge */}
          <SvgGauge
            title="Active Power Draw"
            value={signedPower}
            min={-maxPowerLimit}
            max={maxPowerLimit}
            unit="W"
            colors={['#10b981', '#f59e0b']}
            valueColor="#ec4899"
          />
        </div>
      </div>

      {/* 3. Other parameters below as individual widgets/tiles */}
      <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '1px', marginBottom: '16px', marginTop: '32px' }}>
        BMS Diagnostics & Individual Subsystem Metrics
      </h3>

      <div className="dashboard-bento-grid" style={{ marginBottom: '40px' }}>
        {/* Card 1: State of Charge (SoC) */}
        <ParamCard title="State of Charge" value={telemetryData?.SoC !== undefined ? telemetryData.SoC.toFixed(0) : undefined} unit="%" icon={Battery} color="#10b981" className="span-2">
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '6px' }}>
            <div style={{ height: '100%', width: `${telemetryData?.SoC || 0}%`, background: telemetryData?.SoC < 20 ? '#ef4444' : (telemetryData?.SoC < 50 ? '#f59e0b' : '#10b981'), borderRadius: '3px', transition: 'width 0.8s ease' }} />
          </div>
        </ParamCard>

        {/* Card 2: State of Health (SoH) */}
        <ParamCard title="State of Health" value={telemetryData?.SoH !== undefined ? telemetryData.SoH.toFixed(0) : undefined} unit="%" icon={Heart} color="#ef4444" className="span-2">
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '6px' }}>
            <div style={{ height: '100%', width: `${telemetryData?.SoH || 0}%`, background: '#ef4444', borderRadius: '3px', transition: 'width 0.8s ease' }} />
          </div>
        </ParamCard>

        {/* Card 3: BMS Temperature */}
        <ParamCard title="BMS Temperature" value={telemetryData?.Temperature !== undefined ? telemetryData.Temperature.toFixed(1) : undefined} unit="°C" icon={Thermometer} color="#ef4444">
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '6px' }}>
            <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, (telemetryData?.Temperature || 0) * 1.25))}%`, background: telemetryData?.Temperature > 45 ? '#ef4444' : '#10b981', borderRadius: '3px', transition: 'width 0.8s ease' }} />
          </div>
        </ParamCard>

        {/* Card 4: C-Rate */}
        <ParamCard title="C-Rate" value={telemetryData?.C_rate !== undefined ? telemetryData.C_rate.toFixed(3) : undefined} unit="C" icon={Activity} color="#38bdf8">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '8px', fontWeight: '800', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>
            <span>DISCHARGE</span>
            <span>CHARGE</span>
          </div>
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', position: 'relative', marginTop: '2px', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute',
              left: telemetryData?.C_rate >= 0 ? '50%' : 'auto',
              right: telemetryData?.C_rate >= 0 ? 'auto' : '50%',
              width: `${Math.min(50, Math.abs(telemetryData?.C_rate || 0) * 50)}%`,
              height: '100%',
              background: telemetryData?.C_rate >= 0 ? '#10b981' : '#f59e0b',
              borderRadius: '3px',
              transition: 'width 0.8s ease'
            }} />
          </div>
        </ParamCard>

        {/* Card 5: Cumulative Energy */}
        <ParamCard title="Cumulative Energy" value={telemetryData?.Energy !== undefined ? telemetryData.Energy.toFixed(2) : undefined} unit="Wh" icon={Zap} color="#c084fc">
          <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.25)' }}>Total energy capacity Wh</span>
        </ParamCard>

        {/* Card 6: Charge Capacity Session */}
        <ParamCard title="Charge Session" value={telemetryData?.ChargeDelivered !== undefined ? telemetryData.ChargeDelivered.toFixed(2) : undefined} unit="Ah" icon={ArrowUpRight} color="#10b981">
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '6px' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (telemetryData?.ChargeDelivered || 0) * 10)}%`, background: '#10b981', borderRadius: '3px' }} />
          </div>
        </ParamCard>

        {/* Card 7: Discharge Capacity Session */}
        <ParamCard title="Discharge Session" value={telemetryData?.DischargeDelivered !== undefined ? telemetryData.DischargeDelivered.toFixed(2) : undefined} unit="Ah" icon={ArrowDownRight} color="#f59e0b">
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '6px' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (telemetryData?.DischargeDelivered || 0) * 10)}%`, background: '#f59e0b', borderRadius: '3px' }} />
          </div>
        </ParamCard>

        {/* Card 8: Charging Duration */}
        <ParamCard title="Charge Duration" value={telemetryData?.ChargingTime !== undefined ? (telemetryData.ChargingTime / 60).toFixed(1) : undefined} unit="mins" icon={Clock} color="#10b981">
          <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.25)' }}>Active charging timer</span>
        </ParamCard>

        {/* Card 9: Discharging Duration */}
        <ParamCard title="Discharge Duration" value={telemetryData?.DischargingTime !== undefined ? (telemetryData.DischargingTime / 60).toFixed(1) : undefined} unit="mins" icon={Clock} color="#f59e0b">
          <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.25)' }}>Active discharging timer</span>
        </ParamCard>

        {/* Card 10: Runtime to Cutoff */}
        <ParamCard title="Runtime to Cutoff" value={telemetryData?.RuntimeToCutoff !== undefined ? telemetryData.RuntimeToCutoff.toFixed(1) : undefined} unit="hrs" icon={Hourglass} color="#38bdf8">
          <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.25)' }}>Remaining time under load</span>
        </ParamCard>

        {/* Card 11: Coulombic Efficiency */}
        <ParamCard title="Coulombic Efficiency" value={telemetryData?.Efficiency !== undefined ? (telemetryData.Efficiency * 100).toFixed(1) : undefined} unit="%" icon={CheckCircle} color="#a78bfa">
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '6px' }}>
            <div style={{ height: '100%', width: `${(telemetryData?.Efficiency || 0) * 100}%`, background: '#a78bfa', borderRadius: '3px' }} />
          </div>
        </ParamCard>

        {/* Card 12: Cycle Count */}
        <ParamCard title="Cycle Count" value={telemetryData?.CycleCount} unit="runs" icon={Cpu} color="#38bdf8" className="span-2">
          <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.25)' }}>Total charge/discharge cycles</span>
        </ParamCard>

        {/* Card 13: Max Cell Voltage */}
        <ParamCard title="Max Cell Voltage" value={telemetryData?.MaxVoltage !== undefined ? telemetryData.MaxVoltage.toFixed(3) : undefined} unit="V" icon={ArrowUp} color="#10b981">
          <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.25)' }}>Highest cell reading</span>
        </ParamCard>

        {/* Card 14: Min Cell Voltage */}
        <ParamCard title="Min Cell Voltage" value={telemetryData?.MinVoltage !== undefined ? telemetryData.MinVoltage.toFixed(3) : undefined} unit="V" icon={ArrowDown} color="#ef4444">
          <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.25)' }}>Lowest cell reading</span>
        </ParamCard>

        {/* Card 15: Cell Delta */}
        <ParamCard title="Cell Delta" value={telemetryData?.MaxVoltage && telemetryData?.MinVoltage ? (telemetryData.MaxVoltage - telemetryData.MinVoltage).toFixed(3) : undefined} unit="V" icon={Percent} color="#f59e0b">
          {(() => {
            const d = telemetryData?.MaxVoltage && telemetryData?.MinVoltage ? (telemetryData.MaxVoltage - telemetryData.MinVoltage) : 0;
            const fillCol = d < 0.05 ? '#10b981' : (d < 0.1 ? '#f59e0b' : '#ef4444');
            return (
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '6px' }}>
                <div style={{ height: '100%', width: `${Math.min(100, d * 400)}%`, background: fillCol, borderRadius: '3px' }} />
              </div>
            );
          })()}
        </ParamCard>

        {/* Card 16: Internal Resistance */}
        <ParamCard title="Internal Resistance" value={telemetryData?.InternalResistance !== undefined ? (telemetryData.InternalResistance * 1000).toFixed(1) : undefined} unit="mΩ" icon={Cpu} color="#a78bfa" className="span-2">
          {(() => {
            const ir = (telemetryData?.InternalResistance || 0) * 1000;
            let desc = 'EXCELLENT';
            let color = '#10b981';
            let bg = 'rgba(16, 185, 129, 0.1)';
            if (ir > 100) { desc = 'POOR'; color = '#ef4444'; bg = 'rgba(239, 68, 68, 0.1)'; }
            else if (ir > 50) { desc = 'FAIR'; color = '#f59e0b'; bg = 'rgba(245, 158, 11, 0.1)'; }
            return (
              <div style={{ marginTop: '2px', display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '8px', fontWeight: '900', background: bg, color: color }}>
                HEALTH: {desc}
              </div>
            );
          })()}
        </ParamCard>

        {/* Card 17: Voltage Slope */}
        <ParamCard title="Voltage Slope" value={telemetryData?.VoltageSlope !== undefined ? (telemetryData.VoltageSlope * 1000).toFixed(2) : undefined} unit="mV/min" icon={Activity} color="#38bdf8">
          {(() => {
            const vs = telemetryData?.VoltageSlope || 0;
            return (
              <span style={{ fontSize: '9px', fontWeight: '800', color: vs >= 0 ? '#10b981' : '#ef4444' }}>
                {vs >= 0 ? '▲ INCREASING' : '▼ DECREASING'}
              </span>
            );
          })()}
        </ParamCard>

        {/* Card 18: Charging State */}
        <ParamCard title="Charging State" value={telemetryData?.Status !== undefined ? `0x0${telemetryData.Status}` : undefined} unit="" icon={Info} color="#38bdf8" className="span-2">
          <span style={{ fontSize: '10px', fontWeight: '800', color: statusInfo.color }}>
            {statusInfo.text.toUpperCase()}
          </span>
        </ParamCard>

        {/* Card 19: Charging Phase */}
        <ParamCard title="Charging Phase" value={telemetryData?.ChargingPhase} unit="" icon={Activity} color="#a78bfa">
          <span style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.7)' }}>
            {telemetryData?.ChargingPhase === 1 ? 'CC (CONSTANT CURRENT)' : (telemetryData?.ChargingPhase === 2 ? 'CV (CONSTANT VOLTAGE)' : 'NONE')}
          </span>
        </ParamCard>

        {/* Card 20: OTA Capable */}
        <ParamCard title="OTA Capable" value={telemetryData?.OtaEnabled === '1' || telemetryData?.OtaEnabled === 1 ? 'YES' : 'NO'} unit="" icon={ShieldCheck} color="#10b981">
          <span style={{ fontSize: '10px', fontWeight: '800', color: (telemetryData?.OtaEnabled === '1' || telemetryData?.OtaEnabled === 1) ? '#10b981' : '#64748b' }}>
            {(telemetryData?.OtaEnabled === '1' || telemetryData?.OtaEnabled === 1) ? 'FIRMWARE UPGRADABLE' : 'DISABLED'}
          </span>
        </ParamCard>

        {/* Card 21: Atmospheric Pressure */}
        <ParamCard title="Baro Pressure" value={telemetryData?.Pressure !== undefined ? telemetryData.Pressure.toFixed(1) : undefined} unit="hPa" icon={Wind} color="#38bdf8">
          <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.25)' }}>Atmospheric sensor reading</span>
        </ParamCard>

        {/* Card 22: Absolute Altitude */}
        <ParamCard title="Absolute Altitude" value={telemetryData?.Altitude !== undefined ? telemetryData.Altitude.toFixed(1) : undefined} unit="m" icon={Mountain} color="#a78bfa">
          <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.25)' }}>Height above sea level</span>
        </ParamCard>

        {/* Card 23: WiFi Signal RSSI */}
        <ParamCard title="WiFi Signal" value={telemetryData?.WiFiRSSI} unit="dBm" icon={Wifi} color="#10b981">
          <div style={{ marginTop: '4px' }}>
            {renderWifiSignalBars(telemetryData?.WiFiRSSI)}
          </div>
        </ParamCard>

        {/* Card 24: Battery Profile Config */}
        <ParamCard title="Battery Config" value={telemetryData?.Config} unit="" icon={Zap} color="#38bdf8">
          <span style={{ fontSize: '9px', fontWeight: '800', color: 'rgba(255,255,255,0.7)' }}>
            CELL DESIGN: {telemetryData?.Config || 'UNDETECTED'}
          </span>
        </ParamCard>
      </div>

    </div>
  );
};

export default LiveTelemetry;
