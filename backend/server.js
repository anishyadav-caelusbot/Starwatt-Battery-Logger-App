const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { InfluxDB } = require('@influxdata/influxdb-client');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Persistent Data Folder
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const OFFSETS_FILE = path.join(DATA_DIR, 'offsets.json');
const DETAILS_FILE = path.join(DATA_DIR, 'device_details.json');
const DB_CONFIG_FILE = path.join(DATA_DIR, 'db_config.json');

// Initialize local configurations
function readJsonFile(filePath, defaultVal) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err);
  }
  fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2), 'utf8');
  return defaultVal;
}

let offsets = readJsonFile(OFFSETS_FILE, {});
let deviceDetails = readJsonFile(DETAILS_FILE, {});

// InfluxDB Dynamic Connection Configuration Setup
const defaultDbConfig = {
  url: process.env.INFLUX_URL || 'http://host.docker.internal:8086',
  token: process.env.INFLUX_TOKEN || '',
  org: process.env.INFLUX_ORG || 'starwatt',
  bucket: process.env.INFLUX_BUCKET || 'philips',
  mockMode: process.env.MOCK_MODE === 'true' || !process.env.INFLUX_TOKEN
};

let activeConfig = readJsonFile(DB_CONFIG_FILE, defaultDbConfig);

// If environment variables are explicitly defined in the environment (e.g. via .env on container restart),
// let them override the saved JSON config so that changes to .env actually take effect.
let didOverride = false;
if (process.env.INFLUX_URL && process.env.INFLUX_URL !== activeConfig.url) {
  activeConfig.url = process.env.INFLUX_URL;
  didOverride = true;
}
if (process.env.INFLUX_TOKEN && process.env.INFLUX_TOKEN !== activeConfig.token) {
  activeConfig.token = process.env.INFLUX_TOKEN;
  didOverride = true;
}
if (process.env.INFLUX_ORG && process.env.INFLUX_ORG !== activeConfig.org) {
  activeConfig.org = process.env.INFLUX_ORG;
  didOverride = true;
}
if (process.env.INFLUX_BUCKET && process.env.INFLUX_BUCKET !== activeConfig.bucket) {
  activeConfig.bucket = process.env.INFLUX_BUCKET;
  didOverride = true;
}
if (process.env.MOCK_MODE !== undefined) {
  const isMockEnv = process.env.MOCK_MODE === 'true';
  if (isMockEnv !== activeConfig.mockMode) {
    activeConfig.mockMode = isMockEnv;
    didOverride = true;
  }
}

// Ensure mockMode is active if there is no token
if (!activeConfig.token && !activeConfig.mockMode) {
  activeConfig.mockMode = true;
  didOverride = true;
}

if (didOverride) {
  try {
    fs.writeFileSync(DB_CONFIG_FILE, JSON.stringify(activeConfig, null, 2), 'utf8');
    console.log('Database configuration overridden by environment variables and saved.');
  } catch (err) {
    console.error('Error writing overridden db_config.json:', err);
  }
}

let influxQueryApi = null;
let isMockModeActive = true;

async function connectToInflux(config) {
  if (config.mockMode || !config.token) {
    influxQueryApi = null;
    isMockModeActive = true;
    console.log('Switched to Mock Telemetry Mode (simulation engine).');
    return { success: true, mode: 'mock' };
  }

  try {
    const influxDB = new InfluxDB({ url: config.url, token: config.token });
    const queryApi = influxDB.getQueryApi(config.org);

    // Test connectivity and permissions by running a minimal query
    const testQuery = `
      from(bucket: "${config.bucket}")
        |> range(start: -1m)
        |> limit(n: 1)
    `;
    await queryApi.collectRows(testQuery);

    influxQueryApi = queryApi;
    isMockModeActive = false;
    console.log(`Successfully connected and authenticated to InfluxDB at ${config.url}`);
    return { success: true, mode: 'live' };
  } catch (err) {
    console.error(`Error connecting to InfluxDB at ${config.url}:`, err.message || err);
    influxQueryApi = null;
    isMockModeActive = true;
    return { success: false, error: err.message || String(err), mode: 'mock' };
  }
}

// Perform initial connection
connectToInflux(activeConfig);

// -------------------------------------------------------------
// High-Fidelity LFP Battery Telemetry Simulation Engine
// -------------------------------------------------------------
const mockDevices = [
  { device: 'BatteryLog', location: 'Starwatt-Lab', config: 'LFP-4S', otaEnabled: '1' },
  { device: 'BatteryLog-Beta', location: 'Starwatt-Lab', config: 'LFP-8S', otaEnabled: '1' },
  { device: 'BatteryLog-Gamma', location: 'Field-Station-A', config: 'NMC-13S', otaEnabled: '0' }
];

// In-memory simulator states for each mock device
const simulatorStates = {};
mockDevices.forEach(d => {
  const isLFP4S = d.config === 'LFP-4S';
  const isLFP8S = d.config === 'LFP-8S';
  const cellCount = isLFP4S ? 4 : (isLFP8S ? 8 : 13);
  const cellNominalV = isLFP4S || isLFP8S ? 3.2 : 3.7;
  const capacityAh = isLFP4S ? 100 : (isLFP8S ? 200 : 50);

  simulatorStates[d.device] = {
    deviceInfo: d,
    cellCount,
    cellNominalV,
    capacityAh,
    soc: 45.0 + Math.random() * 20, // Start around middle SoC
    soh: 98.5 + Math.random() * 1.5,
    cycleCount: Math.floor(Math.random() * 10),
    chargeDelivered: 110.0 + Math.random() * 100,
    dischargeDelivered: 50.0 + Math.random() * 100,
    energyWh: 180.0,
    temperature: 28.0 + Math.random() * 5,
    chargingPhase: 1, // CC
    status: 1, // 1: Charging, 2: Discharging, 0: Idle, 3: Fault
    chargingTime: 120.0,
    dischargingTime: 0.0,
    lastTime: Date.now(),
    history: []
  };

  // Generate 2 hours of historical data at 30s intervals
  const historyPoints = 240;
  const timeStepMs = 30000;
  let simulatedTime = Date.now() - (historyPoints * timeStepMs);

  for (let i = 0; i < historyPoints; i++) {
    simulatedTime += timeStepMs;
    const telemetry = simulateNextStep(simulatorStates[d.device], timeStepMs, simulatedTime);
    // Deep copy to store in history
    simulatorStates[d.device].history.push({ ...telemetry });
  }
});

// Periodic simulator updater (appends new reading every 5 seconds)
setInterval(() => {
  const timeStepMs = 5000;
  const now = Date.now();
  mockDevices.forEach(d => {
    const state = simulatorStates[d.device];
    const telemetry = simulateNextStep(state, timeStepMs, now);
    state.history.push({ ...telemetry });
    // Cap in-memory history at last 1000 points
    if (state.history.length > 1000) {
      state.history.shift();
    }
  });
}, 5000);

// Physics-based battery simulator step
function simulateNextStep(state, timeStepMs, timestamp) {
  const dtHours = timeStepMs / 3600000;
  const dtSeconds = timeStepMs / 1000;

  // 1. Cycle state machine (Charge / Discharge / Idle / Fault)
  // Transition thresholds
  if (state.status === 1) { // Charging
    state.chargingTime += dtSeconds;
    state.dischargingTime = 0.0;
    // Charge current simulation (CC/CV behavior)
    let baseCurrent = 15.0; // 15A charge
    if (state.soc > 85.0) {
      state.chargingPhase = 2; // CV phase
      // Current tapers off as SoC approaches 100%
      baseCurrent = 15.0 * (100.0 - state.soc) / 15.0;
      if (baseCurrent < 0.2) baseCurrent = 0.2;
    } else {
      state.chargingPhase = 1; // CC phase
    }
    
    state.current = baseCurrent + (Math.random() - 0.5) * 0.1; // Add minor noise
    state.soc += (state.current * dtHours / state.capacityAh) * 100.0;
    state.chargeDelivered += state.current * dtHours;

    if (state.soc >= 100.0) {
      state.soc = 100.0;
      state.status = 2; // Transition to discharge
      state.chargingPhase = 0;
      state.cycleCount += 1;
    }
  } else if (state.status === 2) { // Discharging
    state.dischargingTime += dtSeconds;
    state.chargingTime = 0.0;
    state.chargingPhase = 0;
    
    // Constant load discharge (e.g. -20A load)
    const dischargeRate = -20.0;
    state.current = dischargeRate + (Math.random() - 0.5) * 0.2;
    state.soc += (state.current * dtHours / state.capacityAh) * 100.0;
    state.dischargeDelivered += Math.abs(state.current) * dtHours;

    if (state.soc <= 5.0) {
      state.soc = 5.0;
      state.status = 1; // Transition to charging
    }
  }

  // 2. Battery properties calculation
  // Open Circuit Voltage (OCV) curve based on SoC
  let ocvCell = state.cellNominalV;
  if (state.cellNominalV === 3.2) { // LFP Cell OCV Curve
    if (state.soc > 90) ocvCell = 3.35 + 0.15 * (state.soc - 90) / 10;
    else if (state.soc > 20) ocvCell = 3.18 + 0.17 * (state.soc - 20) / 70;
    else ocvCell = 2.8 + 0.38 * state.soc / 20;
  } else { // NMC Cell OCV Curve
    ocvCell = 3.0 + 1.2 * (state.soc / 100.0);
  }

  // Internal Resistance (varies slightly with SoC and Temp)
  const baseIR = 0.003; // cell resistance (ohms)
  const cellIR = baseIR * (1.0 + (100.0 - state.soc) * 0.005 + Math.max(0, 35 - state.temperature) * 0.01);
  state.internalResistance = cellIR * state.cellCount;

  // Voltage = OCV + Current * IR
  state.voltage = (ocvCell * state.cellCount) + (state.current * state.internalResistance);

  // Limit voltage boundaries
  const maxAllowable = state.cellCount * (state.cellNominalV === 3.2 ? 3.65 : 4.25);
  const minAllowable = state.cellCount * (state.cellNominalV === 3.2 ? 2.5 : 2.8);
  if (state.voltage > maxAllowable) state.voltage = maxAllowable;
  if (state.voltage < minAllowable) state.voltage = minAllowable;

  // Power
  state.power = state.voltage * state.current;
  
  // Energy Wh
  state.energyWh += Math.abs(state.power) * dtHours;

  // C-rate
  state.c_rate = Math.abs(state.current) / state.capacityAh;

  // Voltage Slope (V / minute)
  const prevPoint = state.history[state.history.length - 1];
  if (prevPoint) {
    state.voltageSlope = (state.voltage - prevPoint.Voltage) / (dtSeconds / 60.0);
  } else {
    state.voltageSlope = 0.0;
  }

  // Max / Min Cell Voltages (simulating slight cell mismatch)
  const avgCellV = state.voltage / state.cellCount;
  state.maxVoltage = avgCellV + 0.015 + Math.random() * 0.005;
  state.minVoltage = avgCellV - 0.015 - Math.random() * 0.005;

  // Thermodynamic heating: Temperature rises with I^2 * R, and cools towards ambient (25C)
  const ambientTemp = 25.0;
  const heatGenerated = Math.pow(state.current, 2) * state.internalResistance * 0.002;
  const heatLost = (state.temperature - ambientTemp) * 0.003;
  state.temperature += (heatGenerated - heatLost) * dtSeconds;
  if (state.temperature > 80.0) state.temperature = 80.0; // clamp
  if (state.temperature < 0.0) state.temperature = 0.0;

  // Run time to Cutoff (hours)
  if (state.status === 2 && state.power !== 0) {
    state.runtimeToCutoff = (state.soc - 5.0) / 100.0 * state.capacityAh * (state.cellNominalV * state.cellCount) / Math.abs(state.power);
  } else {
    state.runtimeToCutoff = 0.0;
  }

  // Efficiency
  state.efficiency = 0.95 - (state.internalResistance * 0.05);

  // Pressure and Altitude (Starwatt lab static values with tiny fluctuations)
  state.pressure = 972.06 + (Math.random() - 0.5) * 0.5;
  state.altitude = 348.76 + (Math.random() - 0.5) * 0.1;
  state.wifiRssi = Math.floor(-65 + (Math.random() - 0.5) * 6);

  return {
    _time: new Date(timestamp).toISOString(),
    Location: state.deviceInfo.location,
    Device: state.deviceInfo.device,
    Config: state.deviceInfo.config,
    OtaEnabled: state.deviceInfo.otaEnabled,
    FirmwareVersion: '1.0.0',
    Voltage: Number(state.voltage.toFixed(3)),
    Current: Number(state.current.toFixed(4)),
    Power: Number(state.power.toFixed(3)),
    Energy: Number(state.energyWh.toFixed(2)),
    ChargeDelivered: Number(state.chargeDelivered.toFixed(2)),
    DischargeDelivered: Number(state.dischargeDelivered.toFixed(2)),
    SoC: Number(state.soc.toFixed(1)),
    SoH: Number(state.soh.toFixed(1)),
    C_rate: Number(state.c_rate.toFixed(3)),
    CycleCount: state.cycleCount,
    VoltageSlope: Number(state.voltageSlope.toFixed(4)),
    ChargingTime: Number(state.chargingTime.toFixed(2)),
    DischargingTime: Number(state.dischargingTime.toFixed(2)),
    RuntimeToCutoff: Number(state.runtimeToCutoff.toFixed(2)),
    Efficiency: Number(state.efficiency.toFixed(2)),
    MaxVoltage: Number(state.maxVoltage.toFixed(3)),
    MinVoltage: Number(state.minVoltage.toFixed(3)),
    InternalResistance: Number(state.internalResistance.toFixed(4)),
    Status: state.status,
    ChargingPhase: state.chargingPhase,
    Temperature: Number(state.temperature.toFixed(2)),
    Pressure: Number(state.pressure.toFixed(2)),
    Altitude: Number(state.altitude.toFixed(2)),
    WiFiRSSI: state.wifiRssi
  };
}

// Helper: Apply user-configured offsets to live or historic records
function applyOffsets(record) {
  const deviceKey = `${record.Location || ''}_${record.Device || ''}`;
  const deviceOffsets = offsets[deviceKey];

  if (!deviceOffsets) return record;

  const calibrated = { ...record };
  const numericFields = [
    'Voltage', 'Current', 'Power', 'Energy', 'ChargeDelivered', 'DischargeDelivered',
    'SoC', 'SoH', 'C_rate', 'VoltageSlope', 'ChargingTime', 'DischargingTime',
    'RuntimeToCutoff', 'Efficiency', 'MaxVoltage', 'MinVoltage',
    'InternalResistance', 'Temperature', 'Pressure', 'Altitude', 'WiFiRSSI'
  ];

  numericFields.forEach(f => {
    const offsetVal = parseFloat(deviceOffsets[f]);
    if (!isNaN(offsetVal) && offsetVal !== 0 && calibrated[f] !== undefined) {
      calibrated[f] = Number((calibrated[f] + offsetVal).toFixed(4));
    }
  });

  return calibrated;
}

// -------------------------------------------------------------
// Authentication Middleware & Endpoints
// -------------------------------------------------------------

const ADMIN_USER = process.env.ADMIN_USER || 'starwatt';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Superman$12';
const AUTH_TOKEN = Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const token = authHeader.split(' ')[1];
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
  next();
}

// 1. Login Endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ success: true, token: AUTH_TOKEN });
  }
  return res.status(401).json({ success: false, error: 'Invalid username or password' });
});

// Protect all subsequent /api/ routes
app.use('/api', authenticate);

// 2. Get unique devices list (Location, Device, Config, OtaEnabled)
app.get('/api/devices', async (req, res) => {
  if (isMockModeActive) {
    return res.json(mockDevices);
  }

  // Real InfluxDB query: group by Device and take the last record to preserve metadata tags (Location, Config, etc.)
  const fluxQuery = `
    from(bucket: "${activeConfig.bucket}")
      |> range(start: -30d)
      |> filter(fn: (r) => r["_measurement"] == "BatteryLogger")
      |> keep(columns: ["Location", "Device", "Config", "OtaEnabled"])
      |> group(columns: ["Device"])
      |> last()
  `;

  try {
    const results = [];
    const rows = await influxQueryApi.collectRows(fluxQuery);
    rows.forEach(row => {
      results.push({
        device: row.Device,
        location: row.Location || 'Unknown',
        config: row.Config || 'Unknown',
        otaEnabled: row.OtaEnabled || '0'
      });
    });
    // Fallback if DB is empty
    if (results.length === 0) {
      return res.json(mockDevices);
    }
    return res.json(results);
  } catch (err) {
    console.error('Error fetching unique devices from InfluxDB:', err);
    return res.json(mockDevices); // Fallback to mock devices on error
  }
});

// 2. Get live telemetry values for all active devices (Dashboard)
app.get('/api/live', async (req, res) => {
  if (isMockModeActive) {
    const latestData = mockDevices.map(d => {
      const state = simulatorStates[d.device];
      const rawLatest = state.history[state.history.length - 1];
      const calibrated = applyOffsets(rawLatest);
      
      // Inject user description details
      const detailKey = `${d.location}_${d.device}`;
      calibrated.testDetail = deviceDetails[detailKey] || '';
      return calibrated;
    });
    return res.json(latestData);
  }

  // Real InfluxDB query: get the last record of each field
  const fluxQuery = `
    from(bucket: "${activeConfig.bucket}")
      |> range(start: -24h)
      |> filter(fn: (r) => r["_measurement"] == "BatteryLogger")
      |> last()
  `;

  try {
    const rows = await influxQueryApi.collectRows(fluxQuery);
    
    // Group records by device/location to reconstruct telemetry objects
    const devicesMap = {};
    
    rows.forEach(row => {
      const devKey = `${row.Location || 'Unknown'}_${row.Device || 'Unknown'}`;
      if (!devicesMap[devKey]) {
        devicesMap[devKey] = {
          _time: row._time,
          Location: row.Location,
          Device: row.Device,
          Config: row.Config,
          OtaEnabled: row.OtaEnabled,
          FirmwareVersion: row.FirmwareVersion || '1.0.0',
        };
      }
      devicesMap[devKey][row._field] = parseFloat(row._value) || row._value;
    });

    const results = Object.values(devicesMap).map(rawRecord => {
      const calibrated = applyOffsets(rawRecord);
      const detailKey = `${calibrated.Location || 'Unknown'}_${calibrated.Device || 'Unknown'}`;
      calibrated.testDetail = deviceDetails[detailKey] || '';
      return calibrated;
    });

    if (results.length === 0) {
      // Return mock data if database has no records
      return res.json(mockDevices.map(d => applyOffsets(simulatorStates[d.device].history[simulatorStates[d.device].history.length - 1])));
    }

    return res.json(results);
  } catch (err) {
    console.error('Error fetching live data from InfluxDB:', err);
    // Fallback on error
    const fallback = mockDevices.map(d => applyOffsets(simulatorStates[d.device].history[simulatorStates[d.device].history.length - 1]));
    return res.json(fallback);
  }
});

// 3. Get historical data for charts
app.get('/api/history', async (req, res) => {
  const device = req.query.device || 'BatteryLog';
  const location = req.query.location || 'Starwatt-Lab';
  const range = req.query.range || '24h';
  const start = req.query.start;
  const end = req.query.end;

  let timeRangeStart = `-${range}`;
  let timeRangeStop = 'now()';

  if (range === 'custom' && start && end) {
    timeRangeStart = start;
    timeRangeStop = end;
  }

  // Calculate aggregation window depending on the time range selected
  let windowSize = '1m';
  if (range.endsWith('s')) {
    windowSize = '1s';
  } else if (range.endsWith('m')) {
    const min = parseInt(range);
    if (min <= 5) windowSize = '1s';
    else if (min <= 10) windowSize = '5s';
    else if (min <= 20) windowSize = '10s';
    else windowSize = '20s';
  } else if (range.endsWith('h')) {
    const hr = parseInt(range);
    if (hr <= 1) windowSize = '10s';
    else if (hr <= 3) windowSize = '30s';
    else if (hr <= 6) windowSize = '1m';
    else windowSize = '5m';
  } else if (range.endsWith('d')) {
    const days = parseInt(range);
    if (days <= 7) windowSize = '15m';
    else windowSize = '2h';
  }
  
  if (req.query.aggregate) {
    windowSize = req.query.aggregate; // Allow override
  }

  if (isMockModeActive) {
    const state = simulatorStates[device];
    if (!state) return res.status(404).json({ error: 'Device not found' });

    // Filter local history array based on range
    let filteredHistory = [...state.history];
    const rangeMs = parseRangeToMs(range);
    
    if (range !== 'custom' && rangeMs > 0) {
      const cutOff = Date.now() - rangeMs;
      filteredHistory = filteredHistory.filter(pt => new Date(pt._time).getTime() >= cutOff);
    } else if (range === 'custom' && start && end) {
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      filteredHistory = filteredHistory.filter(pt => {
        const t = new Date(pt._time).getTime();
        return t >= startMs && t <= endMs;
      });
    }

    // Downsample the history if it's too large for the frontend charts
    const maxPoints = 300;
    if (filteredHistory.length > maxPoints) {
      const step = Math.ceil(filteredHistory.length / maxPoints);
      filteredHistory = filteredHistory.filter((_, idx) => idx % step === 0);
    }

    const result = filteredHistory.map(pt => applyOffsets(pt));
    return res.json(result);
  }

  // Real InfluxDB historical query
  const fluxQuery = `
    from(bucket: "${activeConfig.bucket}")
      |> range(start: ${timeRangeStart}, stop: ${timeRangeStop})
      |> filter(fn: (r) => r["_measurement"] == "BatteryLogger")
      |> filter(fn: (r) => r["Location"] == "${location}")
      |> filter(fn: (r) => r["Device"] == "${device}")
      |> aggregateWindow(every: ${windowSize}, fn: last, createEmpty: false)
      |> yield(name: "last")
  `;

  try {
    const rows = await influxQueryApi.collectRows(fluxQuery);
    
    // Group cells by timestamp to reconstruct records
    const timeGroups = {};
    rows.forEach(row => {
      const timeStr = row._time;
      if (!timeGroups[timeStr]) {
        timeGroups[timeStr] = {
          _time: timeStr,
          Location: row.Location,
          Device: row.Device,
          Config: row.Config,
        };
      }
      timeGroups[timeStr][row._field] = parseFloat(row._value) || row._value;
    });

    const result = Object.values(timeGroups)
      .map(pt => applyOffsets(pt))
      .sort((a, b) => new Date(a._time) - new Date(b._time));

    return res.json(result);
  } catch (err) {
    console.error('Error fetching historical data from InfluxDB:', err);
    // Return empty array on error rather than breaking
    return res.json([]);
  }
});

// Helper for parsing range to ms (mock mode)
function parseRangeToMs(range) {
  const match = range.match(/^(\d+)([shdm])$/);
  if (!match) return 86400000; // default 24h
  const num = parseInt(match[1]);
  const unit = match[2];
  if (unit === 's') return num * 1000;
  if (unit === 'm') return num * 60 * 1000;
  if (unit === 'h') return num * 60 * 60 * 1000;
  if (unit === 'd') return num * 24 * 60 * 60 * 1000;
  return 86400000;
}

// 4. Calibration Offsets endpoints
app.get('/api/offsets', (req, res) => {
  return res.json(offsets);
});

app.post('/api/offsets', (req, res) => {
  offsets = req.body;
  fs.writeFileSync(OFFSETS_FILE, JSON.stringify(offsets, null, 2), 'utf8');
  console.log('Offsets configuration updated.');
  return res.json({ success: true, offsets });
});

// 5. Device descriptions/details endpoints
app.get('/api/details', (req, res) => {
  return res.json(deviceDetails);
});

app.post('/api/details', (req, res) => {
  const { location, device, text } = req.body;
  if (location && device) {
    const key = `${location}_${device}`;
    deviceDetails[key] = text;
    fs.writeFileSync(DETAILS_FILE, JSON.stringify(deviceDetails, null, 2), 'utf8');
    console.log(`Device details updated for ${key}.`);
    return res.json({ success: true, deviceDetails });
  }
  return res.status(400).json({ error: 'Missing location or device parameter' });
});

// 6. Get Database Configuration
app.get('/api/db-config', (req, res) => {
  return res.json({
    url: activeConfig.url,
    org: activeConfig.org,
    bucket: activeConfig.bucket,
    mockMode: isMockModeActive,
    hasToken: !!activeConfig.token
  });
});

// 7. Save Database Configuration & Test Connection
app.post('/api/db-config', async (req, res) => {
  const { url, token, org, bucket, mockMode } = req.body;

  const testConfig = {
    url: url || activeConfig.url,
    token: token === undefined ? activeConfig.token : token,
    org: org || activeConfig.org,
    bucket: bucket || activeConfig.bucket,
    mockMode: mockMode === undefined ? false : !!mockMode
  };

  const testResult = await connectToInflux(testConfig);

  if (testResult.success) {
    activeConfig = testConfig;
    fs.writeFileSync(DB_CONFIG_FILE, JSON.stringify(activeConfig, null, 2), 'utf8');
    return res.json({ success: true, mode: testResult.mode });
  } else {
    return res.status(400).json({ success: false, error: testResult.error });
  }
});

// Start the Express app
app.listen(PORT, () => {
  console.log(`Battery Monitoring API Server running on port ${PORT}`);
});
