import React, { useState, useEffect } from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';
import { Search, Download, Calendar, RefreshCw, Cpu, Activity, Clock } from 'lucide-react';

const CustomTooltip = ({ active, payload, label, unit }) => {
  if (active && payload && payload.length) {
    const date = new Date(label);
    const dateStr = date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    return (
      <div className="custom-chart-tooltip" style={{
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid var(--border-color)',
        padding: '10px 14px',
        borderRadius: '8px',
        boxShadow: 'var(--glow-card)',
        backdropFilter: 'blur(8px)',
        zIndex: 100
      }}>
        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>{dateStr}</p>
        <p style={{ margin: '4px 0 0 0', fontSize: '14px', fontWeight: 'bold', color: payload[0].stroke || payload[0].color }}>
          {payload[0].name}: {payload[0].value !== null ? payload[0].value.toFixed(2) : 'N/A'} {unit}
        </p>
      </div>
    );
  }
  return null;
};

// Single Parameter Chart Renderer wrapper using Recharts
function BatteryChart({ data, field, title, unit, color, timeRange }) {
  if (!data || data.length === 0) {
    return (
      <div className="chart-card" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '380px', border: '1px solid var(--border-color)' }}>
        <span style={{ color: 'var(--text-muted)' }}>No historical data for {title}</span>
      </div>
    );
  }

  // Parse time and numeric fields correctly
  const chartData = data.map(pt => ({
    x: new Date(pt._time).getTime(),
    y: pt[field] !== undefined && pt[field] !== null ? Number(pt[field]) : null
  })).filter(p => p.y !== null);

  const isArea = (field === 'SoC' || field === 'Temperature' || field === 'Voltage');

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div className="chart-title">
          <Activity size={16} style={{ color: color }} />
          <span>{title} {unit ? `(${unit})` : ''}</span>
        </div>
        <div className="chart-actions">
          <button 
            className="btn btn-sm" 
            title="Download CSV for this parameter"
            onClick={() => exportSingleFieldCSV(data, field, title)}
          >
            <Download size={12} />
          </button>
        </div>
      </div>
      <div style={{ width: '100%', height: '360px', marginTop: '15px' }}>
        <ResponsiveContainer width="100%" height="100%">
          {isArea ? (
            <AreaChart data={chartData} margin={{ top: 10, right: 15, left: -15, bottom: 5 }}>
              <defs>
                <linearGradient id={`grad-${field}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.15)" vertical={false} />
              <XAxis 
                dataKey="x" 
                type="number" 
                domain={['dataMin', 'dataMax']} 
                tickFormatter={(t) => {
                  const d = new Date(t);
                  const showSeconds = timeRange && (timeRange.endsWith('s') || (timeRange.endsWith('m') && parseInt(timeRange) < 60));
                  return d.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: showSeconds ? '2-digit' : undefined 
                  });
                }}
                stroke="#64748b"
                style={{ fontSize: '11px', fontFamily: 'Outfit, sans-serif' }}
                dy={10}
              />
              <YAxis 
                domain={['auto', 'auto']}
                stroke="#64748b"
                style={{ fontSize: '11px', fontFamily: 'Outfit, sans-serif' }}
                tickFormatter={(v) => v !== null ? v.toFixed(2) : ''}
              />
              <Tooltip content={<CustomTooltip unit={unit} />} />
              <Area 
                type="monotone" 
                dataKey="y" 
                name={title} 
                stroke={color} 
                fillOpacity={1} 
                fill={`url(#grad-${field})`} 
                strokeWidth={2} 
                activeDot={{ r: 5 }} 
              />
            </AreaChart>
          ) : (
            <LineChart data={chartData} margin={{ top: 10, right: 15, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.15)" vertical={false} />
              <XAxis 
                dataKey="x" 
                type="number" 
                domain={['dataMin', 'dataMax']} 
                tickFormatter={(t) => {
                  const d = new Date(t);
                  const showSeconds = timeRange && (timeRange.endsWith('s') || (timeRange.endsWith('m') && parseInt(timeRange) < 60));
                  return d.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: showSeconds ? '2-digit' : undefined 
                  });
                }}
                stroke="#64748b"
                style={{ fontSize: '11px', fontFamily: 'Outfit, sans-serif' }}
                dy={10}
              />
              <YAxis 
                domain={['auto', 'auto']}
                stroke="#64748b"
                style={{ fontSize: '11px', fontFamily: 'Outfit, sans-serif' }}
                tickFormatter={(v) => v !== null ? v.toFixed(2) : ''}
              />
              <Tooltip content={<CustomTooltip unit={unit} />} />
              <Line 
                type="monotone" 
                dataKey="y" 
                name={title} 
                stroke={color} 
                strokeWidth={2.5} 
                dot={false} 
                activeDot={{ r: 5 }} 
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function exportSingleFieldCSV(data, field, title) {
  if (!data || data.length === 0) return;
  const csvRows = [['Timestamp', title]];
  data.forEach(pt => {
    csvRows.push([pt._time, pt[field] !== undefined ? pt[field] : '']);
  });
  
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${title.replace(/\s+/g, '_')}_history.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function Analytics({ devices }) {
  const [selectedDevice, setSelectedDevice] = useState(
    localStorage.getItem('selectedDevice') || (devices[0]?.device || 'BatteryLog')
  );
  const [selectedLocation, setSelectedLocation] = useState(
    localStorage.getItem('selectedLocation') || (devices[0]?.location || 'Starwatt-Lab')
  );
  const [timeRange, setTimeRange] = useState('24h');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('primary');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (devices.length > 0) {
      const storedDev = localStorage.getItem('selectedDevice');
      const devExists = devices.some(d => d.device === storedDev);
      if (!storedDev || !devExists) {
        setSelectedDevice(devices[0].device);
        setSelectedLocation(devices[0].location);
      }
    }
  }, [devices]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      let url = `/api/history?device=${selectedDevice}&location=${selectedLocation}&range=${timeRange}`;
      if (timeRange === 'custom') {
        url += `&start=${startDate}&end=${endDate}`;
      }
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setHistoryData(data);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [selectedDevice, selectedLocation, timeRange, startDate, endDate]);

  useEffect(() => {
    let interval = null;
    if (autoRefresh && timeRange !== 'custom') {
      interval = setInterval(() => {
        fetchHistory();
      }, 30000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, selectedDevice, selectedLocation, timeRange]);

  const handleDeviceChange = (e) => {
    const dev = e.target.value;
    setSelectedDevice(dev);
    localStorage.setItem('selectedDevice', dev);
    
    const meta = devices.find(d => d.device === dev);
    if (meta) {
      setSelectedLocation(meta.location);
      localStorage.setItem('selectedLocation', meta.location);
    }
  };

  const handleGlobalExport = () => {
    if (!historyData || historyData.length === 0) return;
    const allFields = [
      'Voltage', 'Current', 'Power', 'Energy', 'ChargeDelivered', 'DischargeDelivered',
      'SoC', 'SoH', 'C_rate', 'CycleCount', 'VoltageSlope', 'ChargingTime', 'DischargingTime',
      'RuntimeToCutoff', 'Efficiency', 'MaxVoltage', 'MinVoltage', 'InternalResistance',
      'Status', 'ChargingPhase', 'Temperature', 'Pressure', 'Altitude', 'WiFiRSSI'
    ];
    
    const csvRows = [['Timestamp', 'Location', 'Device', ...allFields]];
    historyData.forEach(pt => {
      const row = [
        pt._time,
        pt.Location || selectedLocation,
        pt.Device || selectedDevice,
        ...allFields.map(f => pt[f] !== undefined ? pt[f] : '')
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedDevice}_full_telemetry.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Upgraded definitions to match exact JSON dashboard parameters
  const chartDefinitions = [
    // Tab 1: Primary Metrics (from E:\battery_logger.json)
    { field: 'Voltage', title: 'Voltage', unit: 'V', color: '#00ffff', category: 'primary' },
    { field: 'Current', title: 'Ampere', unit: 'A', color: '#39ff14', category: 'primary' },
    { field: 'Power', title: 'Power', unit: 'W', color: '#ff007f', category: 'primary' },
    { field: 'ChargeDelivered', title: 'Charge mAh ', unit: 'mah', color: '#00d2ff', category: 'primary' },
    { field: 'DischargeDelivered', title: 'Discharge MAh', unit: 'mah', color: '#ff9500', category: 'primary' },
    { field: 'ChargingTime', title: 'Charge Time', unit: 'minutes', color: '#b026ff', category: 'primary' },
    { field: 'DischargingTime', title: 'Discharge Time', unit: 'minutes', color: '#ff0055', category: 'primary' },

    // Tab 2: Secondary Electrical
    { field: 'C_rate', title: 'C-Rate', unit: 'C', color: '#bd00ff', category: 'electrical' },
    { field: 'VoltageSlope', title: 'Voltage Slope', unit: 'V/min', color: '#00ffd2', category: 'electrical' },
    { field: 'InternalResistance', title: 'Internal Resistance', unit: 'Ω', color: '#ff5e00', category: 'electrical' },
    { field: 'MaxVoltage', title: 'Max Cell Voltage', unit: 'V', color: '#00ff66', category: 'electrical' },
    { field: 'MinVoltage', title: 'Min Cell Voltage', unit: 'V', color: '#00a8ff', category: 'electrical' },

    // Tab 3: State & Capacity
    { field: 'SoC', title: 'State of Charge', unit: '%', color: '#39ff14', category: 'capacity' },
    { field: 'SoH', title: 'State of Health', unit: '%', color: '#00ff88', category: 'capacity' },
    { field: 'Energy', title: 'Energy Transferred', unit: 'Wh', color: '#ffd700', category: 'capacity' },
    { field: 'Efficiency', title: 'Coulombic Efficiency', unit: '%', color: '#00f5d4', category: 'capacity' },
    { field: 'CycleCount', title: 'Completed Cycle Count', unit: 'cycles', color: '#ffe600', category: 'capacity' },

    // Tab 4: Environment & Safety
    { field: 'Temperature', title: 'Cell Temperature', unit: '°C', color: '#ff3333', category: 'env' },
    { field: 'Pressure', title: 'Barometric Pressure', unit: 'hPa', color: '#05ffc7', category: 'env' },
    { field: 'Altitude', title: 'Geographic Altitude', unit: 'm', color: '#ff00aa', category: 'env' },
    { field: 'WiFiRSSI', title: 'WiFi RSSI Strength', unit: 'dBm', color: '#007fff', category: 'env' },
    { field: 'RuntimeToCutoff', title: 'Runtime to Cutoff', unit: 'hours', color: '#ffaa00', category: 'env' },
    { field: 'Status', title: 'System Status Code', unit: '', color: '#ff0000', category: 'env' },
    { field: 'ChargingPhase', title: 'Charging Phase Code', unit: '', color: '#ff00ff', category: 'env' }
  ];

  const filteredCharts = chartDefinitions.filter(chart => {
    const matchesTab = chart.category === activeSubTab;
    const matchesSearch = chart.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          chart.field.toLowerCase().includes(searchQuery.toLowerCase());
    return searchQuery ? matchesSearch : matchesTab;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Filtering Selector Dashboard */}
      <section className="filter-card">
        <div className="filter-grid">
          <div className="form-group">
            <label className="form-label">Active Battery Module</label>
            <select className="form-select" value={selectedDevice} onChange={handleDeviceChange}>
              {devices.map(d => (
                <option key={d.device} value={d.device}>
                  {d.device} ({d.location})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Time Interval Range</label>
            <select className="form-select" value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
              <option value="1s">Last 1 Second</option>
              <option value="5s">Last 5 Seconds</option>
              <option value="10s">Last 10 Seconds</option>
              <option value="20s">Last 20 Seconds</option>
              <option value="1m">Last 1 Minute</option>
              <option value="3m">Last 3 Minutes</option>
              <option value="5m">Last 5 Minutes</option>
              <option value="10m">Last 10 Minutes</option>
              <option value="20m">Last 20 Minutes</option>
              <option value="40m">Last 40 Minutes</option>
              <option value="1h">Last 1 Hour</option>
              <option value="3h">Last 3 Hours</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="custom">Custom Date Interval</option>
            </select>
          </div>

          {timeRange === 'custom' && (
            <div className="custom-range-row">
              <div className="form-group">
                <label className="form-label">Start Time</label>
                <input 
                  type="datetime-local" 
                  className="form-input" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Time</label>
                <input 
                  type="datetime-local" 
                  className="form-input" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)} 
                />
              </div>
            </div>
          )}

          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', paddingBottom: '12px' }}>
            <input 
              type="checkbox" 
              id="refreshCheckbox" 
              checked={autoRefresh} 
              onChange={(e) => setAutoRefresh(e.target.checked)} 
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="refreshCheckbox" className="form-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
              Auto Refresh Charts
            </label>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" style={{ flexGrow: 1 }} onClick={handleGlobalExport}>
              <Download size={16} />
              <span>Full CSV Export</span>
            </button>
            <button className="btn" title="Force Reload History" onClick={fetchHistory}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </section>

      {/* Search Bar for Quick Filtering */}
      <section className="search-container">
        <Search size={18} className="search-icon" />
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search telemetry parameter charts (e.g. type 'voltage', 'ampere', 'charge', 'temp')..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </section>

      {/* Parameter Categories Navigation (Hidden if Search is active) */}
      {!searchQuery && (
        <section className="tabs-container">
          <button 
            className={`tab-btn ${activeSubTab === 'primary' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('primary')}
          >
            Dashboard Primary (7)
          </button>
          <button 
            className={`tab-btn ${activeSubTab === 'electrical' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('electrical')}
          >
            Sensor Voltages & Res (5)
          </button>
          <button 
            className={`tab-btn ${activeSubTab === 'capacity' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('capacity')}
          >
            Capacity & SoC (5)
          </button>
          <button 
            className={`tab-btn ${activeSubTab === 'env' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('env')}
          >
            Environment & System (7)
          </button>
        </section>
      )}

      {/* Historical Charts Display Grid */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh', gap: '12px' }}>
          <RefreshCw size={24} className="animate-spin" style={{ color: '#38bdf8' }} />
          <span>Processing historical aggregates...</span>
        </div>
      ) : (
        <section className="charts-grid">
          {filteredCharts.map((chart) => (
            <BatteryChart 
              key={chart.field}
              data={historyData}
              field={chart.field}
              title={chart.title}
              unit={chart.unit}
              color={chart.color}
              timeRange={timeRange}
            />
          ))}
          {filteredCharts.length === 0 && (
            <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              No telemetry parameters found matching "{searchQuery}"
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default Analytics;
