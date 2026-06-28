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
const FILTER_FILE = path.join(DATA_DIR, 'device_filter.json');

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

const defaultFilter = {
  measurement: 'BatteryLogger',
  location: 'Starwatt-Lab',
  device: 'BatLog',
  testStartTime: '0'
};
let deviceFilter = readJsonFile(FILTER_FILE, defaultFilter);

// InfluxDB Dynamic Connection Configuration Setup
const defaultDbConfig = {
  url: process.env.INFLUX_URL || 'http://host.docker.internal:8086',
  token: process.env.INFLUX_TOKEN || '',
  org: process.env.INFLUX_ORG || 'starwatt',
  bucket: process.env.INFLUX_BUCKET || 'philips',
  mockMode: false
};

let activeConfig = readJsonFile(DB_CONFIG_FILE, defaultDbConfig);
activeConfig.mockMode = false; // Always force mockMode to false

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
activeConfig.mockMode = false;

if (didOverride) {
  try {
    fs.writeFileSync(DB_CONFIG_FILE, JSON.stringify(activeConfig, null, 2), 'utf8');
    console.log('Database configuration overridden by environment variables and saved.');
  } catch (err) {
    console.error('Error writing overridden db_config.json:', err);
  }
}

let influxQueryApi = null;
let isMockModeActive = false;

// Wrap any InfluxDB collectRows call with a configurable timeout
function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`InfluxDB query timed out after ${ms}ms`)), ms))
  ]);
}

async function connectToInflux(config) {
  if (!config.token) {
    influxQueryApi = null;
    isMockModeActive = false;
    return { success: false, error: 'InfluxDB Token is required', mode: 'live' };
  }

  try {
    const influxDB = new InfluxDB({ url: config.url, token: config.token });
    const queryApi = influxDB.getQueryApi(config.org);

    // Test connectivity with a 8-second timeout
    const testQuery = `
      from(bucket: "${config.bucket}")
        |> range(start: -1m)
        |> limit(n: 1)
    `;
    await withTimeout(queryApi.collectRows(testQuery), 8000);

    influxQueryApi = queryApi;
    isMockModeActive = false;
    console.log(`Successfully connected and authenticated to InfluxDB at ${config.url}`);
    return { success: true, mode: 'live' };
  } catch (err) {
    console.error(`Error connecting to InfluxDB at ${config.url}:`, err.message || err);
    influxQueryApi = null;
    isMockModeActive = false;
    return { success: false, error: err.message || String(err), mode: 'live' };
  }
}

// Perform initial connection
connectToInflux(activeConfig);

// Simulator engine removed

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
  const measurement = req.query.measurement || deviceFilter.measurement;

  // Real InfluxDB query: group by Device and Location, last() retrieves the last points of fields.
  const fluxQuery = `
    from(bucket: "${activeConfig.bucket}")
      |> range(start: -30d)
      |> filter(fn: (r) => r["_measurement"] == "${measurement}")
      |> last()
  `;

  try {
    const resultsMap = {};
    const rows = await influxQueryApi.collectRows(fluxQuery);
    rows.forEach(row => {
      const devKey = `${row.Location || 'Unknown'}_${row.Device}`;
      if (!resultsMap[devKey]) {
        resultsMap[devKey] = {
          device: row.Device,
          location: row.Location || 'Unknown',
          config: 'Unknown',
          otaEnabled: '0'
        };
      }
      if (row._field === 'Config') {
        resultsMap[devKey].config = String(row._value);
      } else if (row._field === 'OtaEnabled') {
        resultsMap[devKey].otaEnabled = String(row._value);
      }
    });

    const results = Object.values(resultsMap);
    return res.json(results);
  } catch (err) {
    console.error('Error fetching unique devices from InfluxDB:', err);
    return res.json([]);
  }
});

// 2. Get live telemetry values for active devices (Dashboard / Live Telemetry)
app.get('/api/live', async (req, res) => {
  const measurement = req.query.measurement || deviceFilter.measurement;
  const location = req.query.location || deviceFilter.location;
  const device = req.query.device || deviceFilter.device;
  const testStartTime = req.query.testStartTime || deviceFilter.testStartTime;

  let filterStr = `|> filter(fn: (r) => r["_measurement"] == "${measurement}")`;
  if (location && location !== 'all') {
    filterStr += `\n|> filter(fn: (r) => r["Location"] == "${location}")`;
  }
  if (device && device !== 'all') {
    filterStr += `\n|> filter(fn: (r) => r["Device"] == "${device}")`;
  }
  if (testStartTime && testStartTime !== 'all') {
    filterStr += `\n|> filter(fn: (r) => r["TestStartTime"] == "${testStartTime}")`;
  }

  // Real InfluxDB query: get the last record of each field, grouped by device
  const fluxQuery = `
    from(bucket: "${activeConfig.bucket}")
      |> range(start: -24h)
      ${filterStr}
      |> last()
  `;

  try {
    const rows = await withTimeout(influxQueryApi.collectRows(fluxQuery), 12000);
    
    // Group records by device/location to reconstruct telemetry objects
    const devicesMap = {};
    
    rows.forEach(row => {
      const devKey = `${row.Location || 'Unknown'}_${row.Device || 'Unknown'}`;
      if (!devicesMap[devKey]) {
        devicesMap[devKey] = {
          _time: row._time,
          Location: row.Location,
          Device: row.Device,
          TestStartTime: parseInt(row.TestStartTime) || 0
        };
      }
      const field = row._field;
      const rawVal = row._value;
      const numVal = parseFloat(rawVal);
      // String fields from the ESP32 payload
      if (field === 'Config' || field === 'FirmwareVersion' || field === 'OtaEnabled') {
        devicesMap[devKey][field] = rawVal;
      } else if (field === 'ChargingState') {
        devicesMap[devKey]['Status'] = isNaN(numVal) ? 0 : numVal;
      } else if (field === 'ChargingPhase') {
        devicesMap[devKey]['ChargingPhase'] = isNaN(numVal) ? 0 : numVal;
      } else {
        devicesMap[devKey][field] = isNaN(numVal) ? rawVal : numVal;
      }
    });

    const results = Object.values(devicesMap).map(rawRecord => {
      rawRecord.Config = rawRecord.Config || 'Unknown';
      rawRecord.FirmwareVersion = rawRecord.FirmwareVersion || '1.0.0';
      const calibrated = applyOffsets(rawRecord);
      const detailKey = `${calibrated.Location || 'Unknown'}_${calibrated.Device || 'Unknown'}`;
      calibrated.testDetail = deviceDetails[detailKey] || '';
      return calibrated;
    });

    return res.json(results);
  } catch (err) {
    console.error('Error fetching live data from InfluxDB:', err.message || err);
    return res.json([]);
  }
});

// 3. Get historical data for charts
app.get('/api/history', async (req, res) => {
  const device = req.query.device || deviceFilter.device || 'BatLog';
  const location = req.query.location || deviceFilter.location || 'Starwatt-Lab';
  const measurement = req.query.measurement || deviceFilter.measurement || 'BatteryLogger';
  const range = req.query.range || '24h';
  const start = req.query.start;
  const end = req.query.end;
  const testStartTime = req.query.testStartTime || deviceFilter.testStartTime;

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

  // Real InfluxDB historical query
  let filterStr = '';
  if (testStartTime && testStartTime !== 'all') {
    filterStr = `|> filter(fn: (r) => r["TestStartTime"] == "${testStartTime}")`;
  }

  const fluxQuery = `
    from(bucket: "${activeConfig.bucket}")
      |> range(start: ${timeRangeStart}, stop: ${timeRangeStop})
      |> filter(fn: (r) => r["_measurement"] == "${measurement}")
      |> filter(fn: (r) => r["Location"] == "${location}")
      |> filter(fn: (r) => r["Device"] == "${device}")
      ${filterStr}
      |> aggregateWindow(every: ${windowSize}, fn: last, createEmpty: false)
      |> yield(name: "last")
  `;

  try {
    const rows = await withTimeout(influxQueryApi.collectRows(fluxQuery), 15000);
    
    // Group cells by timestamp to reconstruct records
    const timeGroups = {};
    rows.forEach(row => {
      const timeStr = row._time;
      if (!timeGroups[timeStr]) {
        timeGroups[timeStr] = {
          _time: timeStr,
          Location: row.Location,
          Device: row.Device,
          TestStartTime: parseInt(row.TestStartTime) || 0
        };
      }
      const field = row._field;
      const rawVal = row._value;
      const numVal = parseFloat(rawVal);
      if (field === 'Config' || field === 'FirmwareVersion' || field === 'OtaEnabled') {
        timeGroups[timeStr][field] = rawVal;
      } else if (field === 'ChargingState') {
        timeGroups[timeStr]['Status'] = isNaN(numVal) ? 0 : numVal;
      } else {
        timeGroups[timeStr][field] = isNaN(numVal) ? rawVal : numVal;
      }
    });

    const result = Object.values(timeGroups)
      .map(pt => applyOffsets(pt))
      .sort((a, b) => new Date(a._time) - new Date(b._time));

    return res.json(result);
  } catch (err) {
    console.error('Error fetching historical data from InfluxDB:', err.message || err);
    // Return empty array on error rather than breaking
    return res.json([]);
  }
});

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

// Test start times endpoint
app.get('/api/test-start-times', async (req, res) => {
  const device = req.query.device || deviceFilter.device || 'BatLog';
  const location = req.query.location || deviceFilter.location || 'Starwatt-Lab';
  const measurement = req.query.measurement || deviceFilter.measurement || 'BatteryLogger';

  const fluxQuery = `
    from(bucket: "${activeConfig.bucket}")
      |> range(start: -30d)
      |> filter(fn: (r) => r["_measurement"] == "${measurement}")
      |> filter(fn: (r) => r["Location"] == "${location}")
      |> filter(fn: (r) => r["Device"] == "${device}")
      |> keep(columns: ["TestStartTime"])
      |> group()
      |> distinct(column: "TestStartTime")
  `;

  try {
    const rows = await influxQueryApi.collectRows(fluxQuery);
    const runs = rows.map(r => parseInt(r._value)).filter(v => !isNaN(v));
    runs.sort((a, b) => b - a); // descending order
    return res.json(runs);
  } catch (err) {
    console.error('Error fetching test-start-times:', err);
    return res.json([]);
  }
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

// Telemetry filter options endpoint (queries InfluxDB for existing tags)
app.get('/api/filter-options', async (req, res) => {
  try {
    // Query unique measurements
    const measQuery = `
      import "influxdata/influxdb/schema"
      schema.measurements(bucket: "${activeConfig.bucket}")
    `;
    let measurements = ['BatteryLogger'];
    try {
      const measRows = await influxQueryApi.collectRows(measQuery);
      const mList = measRows.map(r => r._value).filter(Boolean);
      if (mList.length > 0) measurements = [...new Set(mList)];
    } catch (e) {
      console.warn('Failed to query measurements from InfluxDB, using default:', e.message);
    }

    // Query unique devices and locations
    const devQuery = `
      from(bucket: "${activeConfig.bucket}")
        |> range(start: -30d)
        |> group(columns: ["Device", "Location"])
        |> last()
    `;
    let locations = ['Starwatt-Lab'];
    let devices = ['BatLog'];
    try {
      const devRows = await influxQueryApi.collectRows(devQuery);
      const locList = devRows.map(r => r.Location).filter(Boolean);
      const devList = devRows.map(r => r.Device).filter(Boolean);
      if (locList.length > 0) locations = [...new Set(locList)];
      if (devList.length > 0) devices = [...new Set(devList)];
    } catch (e) {
      console.warn('Failed to query devices/locations from InfluxDB:', e.message);
    }

    return res.json({ measurements, locations, devices });
  } catch (err) {
    console.error('Error fetching filter options:', err);
    return res.json({
      measurements: ['BatteryLogger'],
      locations: ['Starwatt-Lab'],
      devices: ['BatLog']
    });
  }
});

// Telemetry filters endpoint
app.get('/api/filter', (req, res) => {
  return res.json(deviceFilter);
});

app.post('/api/filter', (req, res) => {
  const { measurement, location, device, testStartTime } = req.body;
  deviceFilter = {
    measurement: measurement || 'BatteryLogger',
    location: location || 'all',
    device: device || 'all',
    testStartTime: testStartTime || 'all'
  };
  fs.writeFileSync(FILTER_FILE, JSON.stringify(deviceFilter, null, 2), 'utf8');
  console.log('Telemetry device filter configuration updated:', deviceFilter);
  return res.json({ success: true, filter: deviceFilter });
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
