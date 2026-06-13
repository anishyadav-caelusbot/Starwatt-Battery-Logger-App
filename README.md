# Starwatt Battery Telemetry Dashboard (React + Node.js)

A premium, custom dark-themed telemetry monitoring dashboard for LFP and NMC batteries. This application replaces the old ASP.NET system with a lightweight, high-performance Node.js (Express) backend and a React (Vite) frontend, designed to be deployed with a single command via Docker Compose.

All logins and email alerts have been removed, while adding interactive charting capabilities for all **24 telemetry parameters** from the InfluxDB payload.

---

## Features

- **Fleet Overview Dashboard**: Displays aggregated statistics (Active Modules, Average SoC, Average Temperature, Active Chargers) and detailed device cards with pulsing status indicators, circular SoC meters, and 1-hour live SVG sparklines.
- **Dynamic Device Logging**: Each battery card contains an editable field for test notes, which automatically saves to the backend server.
- **Interactive 24-Parameter Charting Grid**:
  - Automatically maps and aggregates historical queries over selected intervals (`1h`, `6h`, `24h`, `7d`, `30d`, and Custom DateTime Ranges).
  - Divided into 4 tabbed layouts: *Core Electrical*, *State & Capacity*, *Cell Voltages & Safety*, and *Environment & Timing*.
  - Built-in search bar lets you instantly isolate charts (e.g. searching "temp" lists only temperature-related graphs).
  - Fully interactive zooming, panning, and hovering tooltips via ApexCharts.
- **Sensor Calibration Offsets**: Manage calibration adjustments for Voltage, Current, Power, Temperature, SoC, and SoH. Offsets are stored persistently and applied mathematically at the API layer.
- **Zero-Dependency Mock Telemetry**: If InfluxDB is down or `MOCK_MODE=true` is set, a high-fidelity battery physics simulator kicks in, simulating charging curves (CC/CV phases), thermodynamic heating, IR voltage drops, WiFi signal noise, and pressure variances.

---

## 24 Monitored Telemetry Parameters

1. **Voltage** (V)
2. **Current** (A)
3. **Power** (W)
4. **Energy** (Wh)
5. **ChargeDelivered** (Ah)
6. **DischargeDelivered** (Ah)
7. **SoC** (State of Charge, %)
8. **SoH** (State of Health, %)
9. **C_rate** (C)
10. **CycleCount** (cycles)
11. **VoltageSlope** (V/min)
12. **ChargingTime** (seconds)
13. **DischargingTime** (seconds)
14. **RuntimeToCutoff** (hours)
15. **Efficiency** (%)
16. **MaxVoltage** (V)
17. **MinVoltage** (V)
18. **InternalResistance** (Ω)
19. **Status** (Code)
20. **ChargingPhase** (Code)
21. **Temperature** (°C)
22. **Pressure** (hPa)
23. **Altitude** (meters)
24. **WiFiRSSI** (dBm)

---

## Quick Start (One Command Deployment)

1. Ensure **Docker** and **Docker Compose** are installed and running on your system.
2. Open a terminal at the root of `BatteryLoggerApp`.
3. Start the application:
   ```bash
   docker-compose up --build -d
   ```
4. Access the web dashboard in your browser at:
   - **Frontend**: [http://localhost](http://localhost) (Port 80)
   - **Backend API**: [http://localhost:5000/api/live](http://localhost:5000/api/live)

---

## Server Git Deployment (One Command)

To deploy the dashboard on a fresh remote server directly from your GitHub repository, run this single command:

**For Linux / macOS Servers:**
```bash
git clone https://github.com/anishyadav-caelusbot/Starwatt-Battery-Logger-App.git && cd Starwatt-Battery-Logger-App && chmod +x deploy.sh && ./deploy.sh
```

**For Windows Servers:**
```cmd
git clone https://github.com/anishyadav-caelusbot/Starwatt-Battery-Logger-App.git && cd Starwatt-Battery-Logger-App && deploy.bat
```

### Passing InfluxDB Config Inline
If you want to configure your live database connection variables immediately inside the same single command without manually editing any `.env` files, you can pass the environment variables inline like this:

**For Linux / macOS:**
```bash
git clone https://github.com/anishyadav-caelusbot/Starwatt-Battery-Logger-App.git && cd Starwatt-Battery-Logger-App && INFLUX_TOKEN="8971090763" INFLUX_URL="http://69.62.73.206:8086" INFLUX_ORG="starwatt" INFLUX_BUCKET="philips" MOCK_MODE="false" ADMIN_USER="starwatt" ADMIN_PASS="Superman$12" docker-compose up --build -d
```

---

## Configuration & InfluxDB Setup

To hook the dashboard up to your live InfluxDB instance, configure the environment variables:

1. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your credentials:
   ```env
   INFLUX_URL=http://host.docker.internal:8086  # Refers to host machine from inside Docker container
   INFLUX_TOKEN=your_influx_token
   INFLUX_ORG=starwatt
   INFLUX_BUCKET=philips
   MOCK_MODE=false                              # Set to false to pull live data
   ```
3. Restart the containers:
   ```bash
   docker-compose down && docker-compose up -d
   ```
