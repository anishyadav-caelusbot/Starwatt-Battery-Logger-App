
//config.h >> setupFunctions.h >> sensorFunctions.h >> FullFuntion.ino

#define ESP32_RTOS  // Uncomment this line if you want to use the code with freertos only on the ESP32
                    // Has to be done before including "OTA.h"

#include "OTA.h"
#include <Wire.h>
#include <Preferences.h>
#include <Adafruit_I2CDevice.h>
#include <Adafruit_I2CRegister.h>
#include "time.h"
#include "PubSubClient.h"
#include "Adafruit_MCP9600.h"
#include "setupFunctions.h"

// Check WIFI connectivity LED Status
void WiFiConnected()
{
  if (WiFi.status() != WL_CONNECTED) 
  {
    Serial.println("WiFi Connection Lost");
    digitalWrite(WiFiLED, LOW);
  }
  else
  {
    digitalWrite(WiFiLED, HIGH);    
  }
}

// PanelButtons: Get Start Button Status
int StartStopButton()
{
  preferences.begin("station", false);
  TestButtonState = preferences.getInt("StartButton", 0);
  preferences.end();
  return TestButtonState;
}

// Get/Set Test Start Time
unsigned long TestTime()
{
  preferences.begin("station", false);
  TestTimeMem = preferences.getULong("TestTime", 0);
  TestTimeMemPrestate = preferences.getUInt("Test-Timept", 0);
  
  if (TestButtonState == 1 && TestTimeMemPrestate == 0)
  {
    TestTimeMem = Get_Epoch_Time();
    preferences.putULong("TestTime", TestTimeMem);
    TestTimeMemPrestate = 1;
    preferences.putUInt("Test-Timept", TestTimeMemPrestate);
  }
  else if (TestButtonState == 0)
  {
    TestTimeMemPrestate = 0;
    preferences.putUInt("Test-Timept", TestTimeMemPrestate);
  }
  
  preferences.end();
  return TestTimeMem;
}

// Toggle Test State (Start/Stop)
void toggleTestState() {
  preferences.begin("station", false);
  TestButtonState = preferences.getInt("StartButton", 0);
  if (TestButtonState == 0) {
    TestButtonState = 1;
    TestTimeMem = Get_Epoch_Time();
    preferences.putULong("TestTime", TestTimeMem);
    TestTimeMemPrestate = 1;
    preferences.putUInt("Test-Timept", TestTimeMemPrestate);
    Serial.println("Test started");
  } else {
    TestButtonState = 0;
    Serial.println("Test stopped");
  }
  preferences.putInt("StartButton", TestButtonState);
  preferences.end();
}

struct BatteryConfig {
  const char* name;
  float std_full_v;
  float std_cutoff_v;
  bool is_lfp;
  int series_cells;
};

// Available candidates: 2S, 3S, 4S, 5S for LFP & NMC
static const BatteryConfig candidates[] = {
  {"2S_LFP", 7.30f, 5.00f, true, 2},
  {"2S_NMC", 8.40f, 6.00f, false, 2},
  {"3S_LFP", 10.95f, 7.50f, true, 3},
  {"3S_NMC", 12.60f, 9.00f, false, 3},
  {"4S_LFP", 14.60f, 10.00f, true, 4},
  {"4S_NMC", 16.80f, 12.00f, false, 4},
  {"5S_LFP", 18.25f, 12.50f, true, 5},
  {"5S_NMC", 21.00f, 15.00f, false, 5}
};

static const int num_candidates = sizeof(candidates) / sizeof(candidates[0]);

// Helper to guess configuration based on voltage
BatteryConfig guessConfiguration(float voltage) {
  if (voltage < 3.0f) {
    return candidates[4]; // Default fallback: 4S_LFP
  }
  
  int best_index = 4;
  float min_diff = 999.0f;
  
  for (int i = 0; i < num_candidates; i++) {
    float nominal_v = (candidates[i].std_full_v + candidates[i].std_cutoff_v) / 2.0f;
    float diff = abs(voltage - nominal_v);
    if (diff < min_diff) {
      min_diff = diff;
      best_index = i;
    }
  }
  return candidates[best_index];
}

// Helper to dynamically build the SoC voltage table
void buildSoCVoltageTable(bool is_lfp_battery, float full_v, float cutoff_v) {
  float std_cell_full = is_lfp_battery ? 3.65f : 4.20f;
  float std_cell_cutoff = is_lfp_battery ? 2.50f : 3.00f;
  
  float std_cell_voltages[6] = {
    is_lfp_battery ? 3.65f : 4.20f,
    is_lfp_battery ? 3.30f : 4.05f,
    is_lfp_battery ? 3.25f : 3.90f,
    is_lfp_battery ? 3.20f : 3.70f,
    is_lfp_battery ? 3.10f : 3.50f,
    is_lfp_battery ? 2.50f : 3.00f
  };
  
  float percentages[6] = {100.0f, 90.0f, 70.0f, 30.0f, 10.0f, 0.0f};
  
  for (int i = 0; i < 6; i++) {
    float norm = (std_cell_voltages[i] - std_cell_cutoff) / (std_cell_full - std_cell_cutoff);
    soc_voltage_table[i][0] = cutoff_v + norm * (full_v - cutoff_v);
    soc_voltage_table[i][1] = percentages[i];
  }
}

// Reference wrappers for dynamically getting limits
float getRefFullVoltage() {
  if (capacity_detected && FULL_VOLTAGE > 0.1f) {
    return FULL_VOLTAGE;
  }
  return guessConfiguration(voltage_v).std_full_v;
}

float getRefCutoffVoltage() {
  if (capacity_detected && CUTOFF_VOLTAGE > 0.1f) {
    return CUTOFF_VOLTAGE;
  }
  return guessConfiguration(voltage_v).std_cutoff_v;
}

float getRefCapacity() {
  if (capacity_detected && NOMINAL_CAPACITY_MAH > 1.0f) {
    return NOMINAL_CAPACITY_MAH;
  }
  return 6000.0f; // Placeholder default capacity for integration/c-rate
}

// Save battery logger parameters to preferences (NVS)
void saveParameters() {
  preferences.begin("station", false);
  preferences.putFloat("energy_wh", energy_wh);
  preferences.putFloat("soc_percent", soc_percent);
  preferences.putFloat("soh_percent", soh_percent);
  preferences.putFloat("cumulative_charge_mah", cumulative_charge_mah);
  preferences.putFloat("charge_delivered_mah", charge_delivered_mah);
  preferences.putFloat("discharge_delivered_mah", discharge_delivered_mah);
  preferences.putInt("cycle_count", battery_cycle_count);
  preferences.putFloat("max_voltage", max_voltage);
  preferences.putFloat("min_voltage", min_voltage);
  preferences.putFloat("charging_time_s", charging_time_s);
  preferences.putFloat("discharging_time_s", discharging_time_s);
  preferences.putFloat("nominal_cap", NOMINAL_CAPACITY_MAH);
  preferences.putBool("cap_detected", capacity_detected);
  preferences.putFloat("full_voltage", FULL_VOLTAGE);
  preferences.putFloat("cutoff_voltage", CUTOFF_VOLTAGE);
  preferences.putFloat("efficiency", efficiency);
  preferences.putBool("is_lfp", is_lfp);
  preferences.putInt("series_cells", series_cells);
  preferences.putString("config_str", Config);
  preferences.putFloat("kf_ir", kf_ir_estimate);
  preferences.putFloat("kf_P", kf_P);
  preferences.end();
}

// Load battery logger parameters from preferences (NVS)
void loadParameters() {
  preferences.begin("station", false);
  energy_wh = preferences.getFloat("energy_wh", 0.0);
  soc_percent = preferences.getFloat("soc_percent", -1.0); // Use -1.0 to check if not saved
  soh_percent = preferences.getFloat("soh_percent", 100.0);
  cumulative_charge_mah = preferences.getFloat("cumulative_charge_mah", 0.0);
  charge_delivered_mah = preferences.getFloat("charge_delivered_mah", 0.0);
  discharge_delivered_mah = preferences.getFloat("discharge_delivered_mah", 0.0);
  battery_cycle_count = preferences.getInt("cycle_count", 0);
  max_voltage = preferences.getFloat("max_voltage", 0.0);
  min_voltage = preferences.getFloat("min_voltage", 999.0);
  charging_time_s = preferences.getFloat("charging_time_s", 0.0);
  discharging_time_s = preferences.getFloat("discharging_time_s", 0.0);
  NOMINAL_CAPACITY_MAH = preferences.getFloat("nominal_cap", 0.0);
  capacity_detected = preferences.getBool("cap_detected", false);
  FULL_VOLTAGE = preferences.getFloat("full_voltage", 0.0);
  CUTOFF_VOLTAGE = preferences.getFloat("cutoff_voltage", 0.0);
  efficiency = preferences.getFloat("efficiency", 0.0);
  is_lfp = preferences.getBool("is_lfp", true);
  series_cells = preferences.getInt("series_cells", 4);
  Config = preferences.getString("config_str", "Undetected");
  kf_ir_estimate = preferences.getFloat("kf_ir", 0.0);
  kf_P = preferences.getFloat("kf_P", 0.1);
  preferences.end();

  // Re-build SoC voltage table if capacity has been detected
  if (capacity_detected && FULL_VOLTAGE > 0.1f && CUTOFF_VOLTAGE > 0.1f) {
    buildSoCVoltageTable(is_lfp, FULL_VOLTAGE, CUTOFF_VOLTAGE);
  }
}

#define OFFLINE_FILE "/offline_logs.txt"
#define MAX_OFFLINE_FILE_SIZE (200000) // ~200KB limit
unsigned long lastOfflineWriteTime = 0;
const unsigned long OFFLINE_WRITE_INTERVAL_MS = 10000; // Log at most every 10 seconds when offline to prevent flash wear
bool sendingOffline = false;

// Save telemetry message to SPIFFS offline file
void saveToOfflineLog(const char* message) {
  unsigned long now_ms = millis();
  if (now_ms - lastOfflineWriteTime < OFFLINE_WRITE_INTERVAL_MS) {
    return; // Skip writing to prevent excessive flash wear
  }
  lastOfflineWriteTime = now_ms;

  if (SPIFFS.exists(OFFLINE_FILE)) {
    File file = SPIFFS.open(OFFLINE_FILE, "r");
    size_t size = file.size();
    file.close();
    if (size >= MAX_OFFLINE_FILE_SIZE) {
      Serial.println("Offline log file full. Dropping log entry to protect flash memory.");
      return;
    }
  }

  File file = SPIFFS.open(OFFLINE_FILE, "a");
  if (!file) {
    Serial.println("Failed to open offline log file for writing.");
    return;
  }

  if (file.println(message)) {
    Serial.println("Saved message to offline log.");
  } else {
    Serial.println("Failed to write message to offline log.");
  }
  file.close();
}

// Replay offline logs over MQTT when connection is restored
void sendOfflineLogs() {
  if (sendingOffline) return; // Prevent re-entrancy
  
  if (!SPIFFS.exists(OFFLINE_FILE)) {
    return;
  }

  sendingOffline = true;
  Serial.println("Internet restored. Sending offline logs...");

  File file = SPIFFS.open(OFFLINE_FILE, "r");
  if (!file) {
    Serial.println("Failed to open offline log file for reading.");
    sendingOffline = false;
    return;
  }

  bool success = true;
  File tempFile;
  bool tempOpened = false;

  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;

    if (success && WiFi.status() == WL_CONNECTED && client.connected()) {
      Serial.print("Publishing offline log: ");
      Serial.println(line);
      if (client.publish("station", line.c_str())) {
        last_mqtt_publish_time = millis();
        delay(100); // 100ms delay to prevent network/broker congestion
      } else {
        Serial.println("Publish failed while replaying offline logs.");
        success = false;
      }
    } else {
      success = false;
    }

    if (!success) {
      if (!tempOpened) {
        tempFile = SPIFFS.open("/temp_logs.txt", "w");
        tempOpened = true;
      }
      if (tempFile) {
        tempFile.println(line);
      }
    }
  }

  file.close();

  if (tempOpened) {
    tempFile.close();
    SPIFFS.remove(OFFLINE_FILE);
    SPIFFS.rename("/temp_logs.txt", OFFLINE_FILE);
    Serial.println("Some offline logs could not be sent and were retained.");
  } else {
    SPIFFS.remove(OFFLINE_FILE);
    Serial.println("All offline logs successfully sent and cleared.");
  }

  sendingOffline = false;
}

// Reset All Parameters and Preferences
void resetAllParameters() {
  preferences.begin("station", false);
  preferences.clear();
  preferences.end();

  // Reset endurance test variables
  TestButtonState = 0;
  Station_Cycles_Value = 0;
  Mature_Station_Cycles_Value = 0;
  Station_Cycles_Prestate = 0;
  TestTimeMem = 0;
  TestTimeMemPrestate = 0;

  // Reset battery logger variables
  energy_wh = 0.0;
  soc_percent = 100.0;
  soh_percent = 100.0;
  cumulative_charge_mah = 0.0;
  charge_delivered_mah = 0.0;
  discharge_delivered_mah = 0.0;
  battery_cycle_count = 0;
  max_voltage = 0.0;
  min_voltage = 999.0;
  charging_time_s = 0.0;
  discharging_time_s = 0.0;
  NOMINAL_CAPACITY_MAH = 0.0;
  capacity_detected = false;
  FULL_VOLTAGE = 0.0;
  CUTOFF_VOLTAGE = 0.0;
  efficiency = 0.0;
  internal_resistance = 0.0;
  is_lfp = true;
  series_cells = 4;
  Config = "Undetected";
  kf_ir_estimate = 0.0;
  kf_P = 0.1;
  last_guessed_name = "";

  for (int i = 0; i < 6; i++) {
    soc_voltage_table[i][0] = 0.0;
  }

  Serial.println("All parameters and preferences reset");
}

// Read Unified Button with multi-hold detection
void readButtonState() {
  int reading = digitalRead(ButtonPin);

  // Debounce logic
  if (reading != buttonStatePrevious) {
    buttonLastDebounceTime = millis();
  }

  if ((millis() - buttonLastDebounceTime) > debounceDelay) {
    if (reading == HIGH && !buttonActive) {
      buttonPressTime = millis();
      buttonActive = true;
      Serial.println("Button pressed");
    } else if (reading == LOW && buttonActive) {
      unsigned long duration = millis() - buttonPressTime;
      buttonActive = false;
      Serial.print("Button released. Duration: ");
      Serial.print(duration);
      Serial.println(" ms");

      if (duration >= 10000) {
        // Reset command
        resetAllParameters();
      } else if (duration >= 5000) {
        // Start/Stop command
        toggleTestState();
      } else if (duration >= 50) {
        // Switch OLED screen
        current_screen = (current_screen + 1) % total_screens;
        last_display_switch = millis(); // Reset auto-switch timer
        Serial.print("Screen switched to: ");
        Serial.println(current_screen);
      }
    }
  }
  buttonStatePrevious = reading;
}

// Look up OCV from SoC percentage
float getOcvFromSoc(float soc) {
  for (int i = 0; i < 5; i++) {
    if (soc <= soc_voltage_table[i][1] && soc >= soc_voltage_table[i+1][1]) {
      float v1 = soc_voltage_table[i][0];
      float v2 = soc_voltage_table[i+1][0];
      float s1 = soc_voltage_table[i][1];
      float s2 = soc_voltage_table[i+1][1];
      return v2 + (v1 - v2) * (soc - s2) / (s1 - s2);
    }
  }
  if (soc > soc_voltage_table[0][1]) return soc_voltage_table[0][0];
  if (soc < soc_voltage_table[5][1]) return soc_voltage_table[5][0];
  return 12.8; // Fallback
}

// Estimate SoC from voltage
float estimateSocFromVoltage(float voltage) {
  for (int i = 0; i < 5; i++) {
    if (voltage <= soc_voltage_table[i][0] && voltage >= soc_voltage_table[i+1][0]) {
      float v1 = soc_voltage_table[i][0];
      float v2 = soc_voltage_table[i+1][0];
      float s1 = soc_voltage_table[i][1];
      float s2 = soc_voltage_table[i+1][1];
      if (abs(v2 - v1) < 0.001f) {
        return s1; // Prevent division by zero
      }
      return s1 + (s2 - s1) * (voltage - v1) / (v2 - v1);
    }
  }
  if (voltage > soc_voltage_table[0][0]) return 100.0;
  if (voltage < soc_voltage_table[5][0]) return 0.0;
  return isnan(soc_percent) ? 0.0f : soc_percent;
}

// Read telemetry from INA260 and BME280 (with Thermocouple fallback)
void readSensors() {
  float current_ma = ina260.readCurrent();
  current_a = current_ma / 1000.0;
  float voltage_mv = ina260.readBusVoltage();
  float power_mw = ina260.readPower();
  voltage_v = voltage_mv / 1000.0;
  power_w = power_mw / 1000.0;

  bmp_temp = bmp.readTemperature();
  bmp_press = bmp.readPressure() / 100.0f;
  bmp_altitude = bmp.readAltitude(1013.25);
  bmp_valid = !(isnan(bmp_temp) || isnan(bmp_press));

  if (has_thermocouple) {
    temperature = mcp.readThermocouple();
  } else {
    temperature = bmp_temp; // Fallback to BME280 temperature
  }
}

void classifyAndSetBattery(float max_v, float min_v, float capacity) {
  float best_err = 999.0f;
  int best_idx = -1;
  for (int i = 0; i < num_candidates; i++) {
    float err = abs(max_v - candidates[i].std_full_v) + abs(min_v - candidates[i].std_cutoff_v);
    if (err < best_err) {
      best_err = err;
      best_idx = i;
    }
  }
  
  if (best_idx != -1) {
    Config = candidates[best_idx].name;
    FULL_VOLTAGE = max_v;
    CUTOFF_VOLTAGE = min_v;
    NOMINAL_CAPACITY_MAH = capacity;
    is_lfp = candidates[best_idx].is_lfp;
    series_cells = candidates[best_idx].series_cells;
    capacity_detected = true;
    
    // Calculate efficiency from actual cycle if both metrics were active
    if (charge_delivered_mah > 10.0f && discharge_delivered_mah > 10.0f) {
      efficiency = discharge_delivered_mah / charge_delivered_mah;
      if (efficiency > 1.0f) efficiency = 1.0f;
      if (efficiency < 0.5f) efficiency = 0.5f;
    } else {
      // Fallback estimate based on IR
      if (internal_resistance > 0.0) {
        efficiency = 0.98f - (internal_resistance * 0.05f);
        if (efficiency < 0.5f) efficiency = 0.5f;
        if (efficiency > 1.0f) efficiency = 1.0f;
      } else {
        efficiency = 0.0f;
      }
    }
    
    buildSoCVoltageTable(is_lfp, FULL_VOLTAGE, CUTOFF_VOLTAGE);
    saveParameters();
    
    Serial.println("=================================================");
    Serial.print("Battery detected: "); Serial.println(Config);
    Serial.print("Series cells: "); Serial.println(series_cells);
    Serial.print("Chemistry: "); Serial.println(is_lfp ? "LFP" : "NMC/Li-ion");
    Serial.print("Detected Capacity: "); Serial.print(NOMINAL_CAPACITY_MAH); Serial.println(" mAh");
    Serial.print("Detected Full Voltage: "); Serial.print(FULL_VOLTAGE); Serial.println(" V");
    Serial.print("Detected Cutoff Voltage: "); Serial.print(CUTOFF_VOLTAGE); Serial.println(" V");
    Serial.print("Detected Efficiency: "); Serial.print(efficiency * 100.0f); Serial.println(" %");
    Serial.println("=================================================");
  }
}

// Update battery logger parameters
void updateBatteryParameters(float delta_t_hours, float delta_t_seconds) {
  float current_ma = current_a * 1000.0;
  float old_voltage = last_voltage;

  if (voltage_v > max_voltage) max_voltage = voltage_v;
  if (voltage_v < min_voltage && voltage_v > 0.1) min_voltage = voltage_v;

  if (!capacity_detected) {
    BatteryConfig guessed = guessConfiguration(voltage_v);
    if (String(guessed.name) != last_guessed_name || soc_voltage_table[0][0] < 0.1f) {
      buildSoCVoltageTable(guessed.is_lfp, guessed.std_full_v, guessed.std_cutoff_v);
      last_guessed_name = guessed.name;
    }
  }

  if (isnan(soc_percent) || soc_percent < 0.0) {
    soc_percent = estimateSocFromVoltage(voltage_v);
  }

  float ref_full = getRefFullVoltage();
  float ref_cutoff = getRefCutoffVoltage();
  float ref_capacity = getRefCapacity();
  float voltage_span = ref_full - ref_cutoff;

  // Universal Charged / Charging Detection Logic
  float cutoff_current_ma = 0.03 * ref_capacity; // 3% C-rate cutoff
  if (current_ma > 10.0) {
    if (voltage_v >= (ref_full - 0.2) && current_ma <= cutoff_current_ma) {
      battery_status = "Charged";
    } else {
      battery_status = "Charging";
    }
  } else if (current_ma < -10.0) {
    battery_status = "Discharging";
  } else {
    if (voltage_v >= (ref_full - 0.3) && soc_percent >= 99.0) {
      battery_status = "Charged";
    } else {
      battery_status = "Idle";
    }
  }

  if (battery_status != last_status) {
    if (last_status == "Charging") charging_time_s = 0.0;
    if (last_status == "Discharging") discharging_time_s = 0.0;
  }
  if (battery_status == "Charging") charging_time_s += delta_t_seconds;
  if (battery_status == "Discharging") discharging_time_s += delta_t_seconds;

  energy_wh += (power_w * delta_t_hours);

  float delta_charge_mah = (current_ma * delta_t_hours);
  if (current_ma > 0) charge_delivered_mah += delta_charge_mah;
  if (current_ma < 0) discharge_delivered_mah += abs(delta_charge_mah);

  // Auto-detect NOMINAL_CAPACITY_MAH using complete charge/discharge cycle
  static bool is_measuring_charge = false;
  static float temp_charge_measured_mah = 0.0;
  static bool is_measuring_discharge = false;
  static float temp_discharge_measured_mah = 0.0;

  // Start of charge detection (start charging when voltage is near cutoff)
  if (battery_status == "Charging" && last_status != "Charging") {
    if (voltage_v <= (ref_cutoff + 0.15 * voltage_span)) {
      is_measuring_charge = true;
      temp_charge_measured_mah = 0.0;
      Serial.println("Auto-detect: Starting complete charge cycle measurement.");
    } else {
      is_measuring_charge = false;
    }
  }

  // Start of discharge detection (start discharging when voltage is near full)
  if (battery_status == "Discharging" && last_status != "Discharging") {
    if (voltage_v >= (ref_full - 0.15 * voltage_span)) {
      is_measuring_discharge = true;
      temp_discharge_measured_mah = 0.0;
      Serial.println("Auto-detect: Starting complete discharge cycle measurement.");
    } else {
      is_measuring_discharge = false;
    }
  }

  // Accumulate capacity during charge
  if (is_measuring_charge) {
    if (battery_status == "Charging") {
      temp_charge_measured_mah += delta_charge_mah;
    } else {
      // Transitioned away from Charging. Check if we reached ref_full before stopping
      if (voltage_v >= ref_full - 0.2 && temp_charge_measured_mah > 100.0) {
        classifyAndSetBattery(max_voltage, min_voltage, temp_charge_measured_mah);
      } else {
        Serial.println("Auto-detect: Charge cycle measurement interrupted or incomplete.");
      }
      is_measuring_charge = false;
    }
  }

  // Accumulate capacity during discharge
  if (is_measuring_discharge) {
    if (battery_status == "Discharging") {
      temp_discharge_measured_mah += abs(delta_charge_mah);
      // End condition: hit cutoff voltage
      if (voltage_v <= ref_cutoff + 0.2 && temp_discharge_measured_mah > 100.0) {
        classifyAndSetBattery(max_voltage, min_voltage, temp_discharge_measured_mah);
        is_measuring_discharge = false;
      }
    } else {
      Serial.println("Auto-detect: Discharge cycle measurement interrupted or incomplete.");
      is_measuring_discharge = false;
    }
  }

  last_status = battery_status;

  soc_percent += (delta_charge_mah / ref_capacity) * 100.0;
  if (soc_percent < 0) soc_percent = 0;
  if (soc_percent > 100) soc_percent = 100;

  if (abs(current_ma) < 10.0) {
    float voltage_soc = estimateSocFromVoltage(voltage_v);
    soc_percent = 0.9 * soc_percent + 0.1 * voltage_soc;
  }

  // Dynamic Internal Resistance estimation (Kalman Filter)
  float ocv = getOcvFromSoc(soc_percent);
  if (abs(current_a) > 0.2) {
    float measured_ir = abs(ocv - voltage_v) / abs(current_a);
    if (measured_ir > 0.001 && measured_ir < 2.0) {
      // Predict: P_pred = P + Q
      kf_P = kf_P + kf_Q;
      
      // Update: K = P_pred / (P_pred + R)
      float K = kf_P / (kf_P + kf_R);
      
      // Update estimate: x = x_pred + K * (z - x_pred)
      if (kf_ir_estimate == 0.0) {
        kf_ir_estimate = measured_ir;
      } else {
        kf_ir_estimate = kf_ir_estimate + K * (measured_ir - kf_ir_estimate);
      }
      
      // Update covariance: P = (1 - K) * P_pred
      kf_P = (1.0 - K) * kf_P;
      
      if (kf_ir_estimate < 0.001) kf_ir_estimate = 0.001;
      if (kf_ir_estimate > 0.5) kf_ir_estimate = 0.5;
      
      internal_resistance = kf_ir_estimate;
    }
  }

  // Dynamic State of Health (SoH) estimation based on IR degradation
  float soh_ir = 100.0f;
  if (internal_resistance > 0.0) {
    soh_ir = ((R_aged - internal_resistance) / (R_aged - R_fresh)) * 100.0;
    if (soh_ir < 0.0) soh_ir = 0.0;
    if (soh_ir > 100.0) soh_ir = 100.0;
  }
  soh_percent = soh_ir;

  // Dynamic Efficiency estimation (only estimate from IR if not fully calibrated yet)
  if (!capacity_detected || efficiency == 0.0) {
    if (internal_resistance > 0.0) {
      efficiency = 0.98 - (internal_resistance * 0.05);
      if (efficiency < 0.5) efficiency = 0.5;
      if (efficiency > 1.0) efficiency = 1.0;
    } else {
      efficiency = 0.0;
    }
  }

  // Dynamic Voltage Slope calculation (Volts / Minute)
  float delta_t_minutes = delta_t_seconds / 60.0;
  float current_slope = (voltage_v - old_voltage) / (delta_t_minutes > 0.0 ? delta_t_minutes : 0.01667);
  if (abs(current_slope) < 0.33) {
    voltage_slope = 0.95 * voltage_slope + 0.05 * current_slope;
  }

  last_voltage = voltage_v;

  // Increment cumulative charge to calculate cycle count
  if (current_ma > 0) {
    cumulative_charge_mah += delta_charge_mah;
  }
  if (cumulative_charge_mah >= ref_capacity) {
    battery_cycle_count++;
    cumulative_charge_mah -= ref_capacity;
  }

  c_rate = abs(current_ma) / ref_capacity;
  charging_phase = (current_ma > 0 && voltage_v >= ref_full - 0.1) ? "CV" : "CC";

  if (current_ma < -10.0) {
    float remaining_capacity_mah = (soc_percent / 100.0) * ref_capacity;
    runtime_to_cutoff_s = (remaining_capacity_mah / abs(current_ma)) * 3600.0;
  } else {
    runtime_to_cutoff_s = 0.0;
  }
}

// Get Station Status based on test start and detected voltage
int StationStatus()
{
  if (StartStopButton() != 0)
  {
    if (voltage_v > 0.0)
    {
      StationOn = 1;
    }
    else
    {
      StationOn = 0;
    }
  }
  else
  {
    StationOn = 0;
  }
  return StationOn;
}

// Count Station ON Cycles (excluding input monitoring sensor electricity failure checks)
unsigned int StationCycles(int StationStatus, int startbutton)
{
  Station_Cycles_Value = preferences.getUInt("station-cycles", 0);
  Mature_Station_Cycles_Value = preferences.getUInt("mature-st-cycl", 0);
  Station_Cycles_Prestate = preferences.getUInt("st-cy-prestate", 0);
  
  if (startbutton == 1)
  {
    if (StationStatus == 1 && Station_Cycles_Prestate == 0)
    {
      Station_Cycles_Value++;        preferences.putUInt("station-cycles", Station_Cycles_Value);
      Station_Cycles_Prestate = 1;   preferences.putUInt("st-cy-prestate", Station_Cycles_Prestate);
    }
    else if (StationStatus == 0)
    {
      Station_Cycles_Prestate = 0;   preferences.putUInt("st-cy-prestate", Station_Cycles_Prestate);
    }
  }
  else
  {
    Serial.println("Test Not Started");
  }
 
  if (Station_Cycles_Value > Mature_Station_Cycles_Value)
  {
    Mature_Station_Cycles_Value = Station_Cycles_Value;
    preferences.putUInt("mature-st-cycl", Mature_Station_Cycles_Value);
  }
  else
  {
    Mature_Station_Cycles_Value = preferences.getUInt("mature-st-cycl", 0);
  }

  int optimised_cycle;
  if (Mature_Station_Cycles_Value == 0)
  {
    optimised_cycle = 0;
  }
  else
  {
    optimised_cycle = Mature_Station_Cycles_Value - 1;
  }
  
  return optimised_cycle;  
}

// Check if network time has synced correctly
bool isNtpSynced() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return false;
  }
  return (timeinfo.tm_year >= 116); // 116 corresponds to 2016
}

// Render Diagnostic Screens on SSD1306 OLED
void updateOLED() {
  unsigned long current_time = millis();
  
  if (buttonActive) {
    unsigned long hold_time = current_time - buttonPressTime;
    static unsigned long last_hold_display_update = 0;
    if (current_time - last_hold_display_update < 50) {
      return;
    }
    last_hold_display_update = current_time;

    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 5);
    display.println("--- BUTTON ACTION ---");
    display.setCursor(0, 22);
    if (hold_time >= 10000) {
      display.println(">> RESET PARAMETERS <<");
      display.setCursor(0, 34);
      display.println("Release now to reset!");
    } else if (hold_time >= 5000) {
      display.println(">> START/STOP TEST <<");
      display.setCursor(0, 34);
      display.println("Release now to toggle");
      
      int barWidth = map(hold_time, 5000, 10000, 0, 128);
      display.drawRect(0, 50, 128, 10, SSD1306_WHITE);
      display.fillRect(0, 50, barWidth, 10, SSD1306_WHITE);
    } else {
      display.println("Holding button...");
      display.setCursor(0, 34);
      display.println("Hold 5s: Run, 10s: Rst");
      
      int barWidth = map(hold_time, 0, 5000, 0, 128);
      display.drawRect(0, 50, 128, 10, SSD1306_WHITE);
      display.fillRect(0, 50, barWidth, 10, SSD1306_WHITE);
    }
    display.display();
    return;
  }

  // Auto-switch screen
  if (current_time - last_display_switch >= SCREEN_SWITCH_INTERVAL_MS) {
    current_screen = (current_screen + 1) % total_screens;
    last_display_switch = current_time;
  }

  if (current_time - last_display_update >= DISPLAY_UPDATE_INTERVAL_MS) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);

    // Draw Status Bar (WiFi connection status + device info + NTP + MQTT)
    if (current_screen == 0) {
      // 1. Draw Stopwatch Icon at X=2
      display.drawCircle(5, 4, 3, SSD1306_WHITE);
      display.drawPixel(5, 0, SSD1306_WHITE); // Stem
      display.drawPixel(8, 1, SSD1306_WHITE); // Side button
      display.drawLine(5, 4, 5, 2, SSD1306_WHITE); // Clock hand

      // 2. Compute and Draw Time Since Test Start
      display.setCursor(14, 1);
      if (TestButtonState == 1) {
        unsigned long elapsed = 0;
        unsigned long current_epoch = Get_Epoch_Time();
        unsigned long start_time = TestTime();
        if (current_epoch > 1600000000 && start_time > 1600000000 && current_epoch >= start_time) {
          elapsed = current_epoch - start_time;
        }
        
        unsigned long hours = elapsed / 3600;
        unsigned long minutes = (elapsed % 3600) / 60;
        unsigned long seconds = elapsed % 60;
        
        if (hours >= 24) {
          unsigned long days = hours / 24;
          display.print(days);
          display.print("d ");
          hours = hours % 24;
        }
        char timeBuf[16];
        snprintf(timeBuf, sizeof(timeBuf), "%02lu:%02lu:%02lu", hours, minutes, seconds);
        display.print(timeBuf);
      } else {
        display.print("STOPPED");
      }
    } else {
      int rssi = WiFi.RSSI();
      bool wifi_connected = (WiFi.status() == WL_CONNECTED);

      // 1. Draw WiFi status first (Leftmost, X=2..12)
      if (wifi_connected) {
        int num_bars = 0;
        if (rssi >= -67) num_bars = 4;
        else if (rssi >= -70) num_bars = 3;
        else if (rssi >= -80) num_bars = 2;
        else if (rssi >= -90) num_bars = 1;
        else num_bars = 1;
        
        for (int i = 0; i < 4; i++) {
          int bar_h = (i + 1) * 2;
          int bx = 2 + (i * 3);
          int by = 1 + 8 - bar_h;
          if (i < num_bars) {
            display.fillRect(bx, by, 2, bar_h, SSD1306_WHITE);
          } else {
            display.drawPixel(bx, 1 + 7, SSD1306_WHITE);
          }
        }
      } else {
        // Draw an 'X' over WiFi area
        display.drawLine(2, 1, 12, 7, SSD1306_WHITE);
        display.drawLine(12, 1, 2, 7, SSD1306_WHITE);
      }

      // 2. Draw NTP status second (X=18..24)
      display.drawCircle(21, 4, 3, SSD1306_WHITE);
      if (wifi_connected && isNtpSynced()) {
        display.drawPixel(21, 4, SSD1306_WHITE);
        display.drawPixel(21, 3, SSD1306_WHITE);
        display.drawPixel(22, 4, SSD1306_WHITE);
      } else {
        display.drawLine(18, 1, 24, 7, SSD1306_WHITE);
      }

      // 3. Draw MQTT status third (X=30..34)
      int mX = 30;
      display.drawFastVLine(mX, 1, 7, SSD1306_WHITE);
      display.drawFastVLine(mX + 4, 1, 7, SSD1306_WHITE);
      display.drawPixel(mX + 1, 2, SSD1306_WHITE);
      display.drawPixel(mX + 2, 3, SSD1306_WHITE);
      display.drawPixel(mX + 3, 2, SSD1306_WHITE);

      if (wifi_connected && client.connected()) {
        // Draw Tx Data Activity (Up Arrow) at X=38
        if (current_time - last_mqtt_publish_time < 1500) {
          if ((current_time / 200) % 2 == 0) {
            display.drawFastVLine(38, 1, 7, SSD1306_WHITE);
            display.drawPixel(37, 2, SSD1306_WHITE);
            display.drawPixel(39, 2, SSD1306_WHITE);
          }
        } else {
          display.drawPixel(38, 4, SSD1306_WHITE); // Dim placeholder dot
        }

        // Draw Rx Data Activity (Down Arrow) at X=42
        if (current_time - last_mqtt_receive_time < 1500) {
          if ((current_time / 200) % 2 == 0) {
            display.drawFastVLine(42, 1, 7, SSD1306_WHITE);
            display.drawPixel(41, 6, SSD1306_WHITE);
            display.drawPixel(43, 6, SSD1306_WHITE);
          }
        } else {
          display.drawPixel(42, 4, SSD1306_WHITE); // Dim placeholder dot
        }
      } else {
        display.drawLine(mX - 1, 1, mX + 5, 7, SSD1306_WHITE);
      }

      // 4. Draw WiFi RSSI text right-aligned (X=90)
      if (wifi_connected) {
        display.setCursor(90, 1);
        display.print(rssi);
        display.print("dB");
      } else {
        display.setCursor(84, 1);
        display.print("OFFLINE");
      }
    }
    // Thin separation line
    display.drawFastHLine(0, 10, 128, SSD1306_WHITE);

    if (current_screen == 0) {
      // Screen 0: Overview / Test Status
      display.setCursor(0, 13); 
      display.print("TEST: "); display.println(TestButtonState == 1 ? "RUNNING" : "STOPPED");
      display.setCursor(0, 23); 
      display.print("V: "); display.print(voltage_v, 2); display.println(" V");
      display.setCursor(0, 33); 
      display.print("I: "); display.print(current_a, 3); display.println(" A");
      display.setCursor(0, 43); 
      display.print("P: "); display.print(power_w, 1); display.println(" W");
      display.setCursor(0, 53); 
      display.print("Cycles: "); display.println(Mature_Station_Cycles_Value);
    } 
    else if (current_screen == 1) {
      // Screen 1: Battery Energy & SoC
      display.setCursor(0, 13); 
      display.print("SoC: "); display.print(soc_percent, 1); display.println(" %");
      display.setCursor(0, 23); 
      display.print("SoH: "); display.print(soh_percent, 1); display.println(" %");
      display.setCursor(0, 33); 
      display.print("Energy: "); display.print(energy_wh, 2); display.println(" Wh");
      display.setCursor(0, 43); 
      display.print("Ch/Dch: "); display.print(charge_delivered_mah, 0); display.print("/"); display.print(discharge_delivered_mah, 0); display.println(" mAh");
      display.setCursor(0, 53); 
      display.print("Cap: "); 
      if (capacity_detected) {
        display.print(NOMINAL_CAPACITY_MAH, 0); display.println(" mAh");
      } else {
        display.println("Detecting...");
      }
    } 
    else if (current_screen == 2) {
      // Screen 2: Times & Phase
      display.setCursor(0, 13); 
      display.print("Chg T: "); display.print(charging_time_s / 60.0, 1); display.println(" min");
      display.setCursor(0, 23); 
      display.print("Dch T: "); display.print(discharging_time_s / 60.0, 1); display.println(" min");
      display.setCursor(0, 33); 
      display.print("Run T: "); display.print(runtime_to_cutoff_s / 3600.0, 2); display.println(" hr");
      display.setCursor(0, 43); 
      display.print("C-Rate: "); display.print(c_rate, 2); display.println(" C");
      display.setCursor(0, 53); 
      display.print("Phase: "); display.println(charging_phase);
    } 
    else if (current_screen == 3) {
      // Screen 3: BME280, OCV, IR, and Min/Max
      display.setCursor(0, 13); 
      display.print("Temp: "); display.print(temperature, 1); display.println(" C");
      display.setCursor(0, 23); 
      display.print("IR:   "); display.print(internal_resistance * 1000.0, 1); display.println(" mOhm");
      display.setCursor(0, 33); 
      display.print("Eff:  "); display.print(efficiency * 100.0, 1); display.println(" %");
      display.setCursor(0, 43);
      display.print("Max V:"); display.print(max_voltage, 2); display.println(" V");
      display.setCursor(0, 53); 
      display.print("Min V:"); display.print(min_voltage, 2); display.println(" V");
    }
    
    display.display();
    last_display_update = current_time;
  }
}

// Log data and Publish message
void StationoutputPrams()
{
  Serial.println();
  Serial.println("====================Output Socket : Station 7=====================");
  Epoch_Time = Get_Epoch_Time();
  Serial.print("Epoch Time: ");
  Serial.println(Epoch_Time);

  // Print Telemetry to Serial Monitor
  Serial.print("Voltage: "); Serial.print(voltage_v, 3); Serial.println(" V");
  Serial.print("Current: "); Serial.print(current_a, 4); Serial.println(" A");
  Serial.print("Power: "); Serial.print(power_w, 2); Serial.println(" W");
  Serial.print("Temperature: "); Serial.print(temperature, 2); Serial.println(" C");
  Serial.print("Energy: "); Serial.print(energy_wh, 3); Serial.println(" Wh");
  Serial.print("SoC: "); Serial.print(soc_percent, 1); Serial.println(" %");
  Serial.print("SoH: "); Serial.print(soh_percent, 1); Serial.println(" %");
  Serial.print("Nominal Capacity: "); Serial.print(NOMINAL_CAPACITY_MAH, 1); Serial.println(" mAh");
  Serial.print("Internal Resistance: "); Serial.print(internal_resistance * 1000.0, 2); Serial.println(" mOhm");
  Serial.print("Efficiency: "); Serial.print(efficiency * 100.0, 1); Serial.println(" %");
  Serial.print("Voltage Slope: "); Serial.print(voltage_slope, 4); Serial.println(" V/h");

  preferences.begin("station", false);
  int x = StartStopButton();
  Serial.print("StartStopButton: ");
  Serial.println(x);

  int z = StationStatus();
  Serial.print("Station Status: ");
  Serial.println(z);

  int ab = StationCycles(z, x);
  Serial.print("Station Cycles: ");
  Serial.println(ab);

  unsigned long tt = TestTime();
  Serial.print("Test Start Time: ");
  Serial.println(tt);

  preferences.end();

  // MQTT Message Publish with Battery Parameters (excluding VoltageSlope, Config, Efficiency, InternalResistance)
  digitalWrite(DataTxLed, HIGH);
  int status_code = (battery_status == "Idle") ? 0 : (battery_status == "Charging") ? 1 : (battery_status == "Discharging") ? 2 : 3;
  int charging_phase_code = (charging_phase == "CC") ? 1 : 2;
  int wifi_rssi = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : -120;

  if (x == 0) // send only when TEST is OFF
  {
    snprintf(msg, sizeof(msg),
             "BatteryLogger,Location=%s,Device=%s,TestStartTime=%lu "
             "Config=\"%s\",OtaEnabled=1i,FirmwareVersion=\"%s\",Voltage=0.0,Current=0.0,Power=0.0,Temperature=%.2f,Energy=%.2f,ChargeDelivered=%.2f,DischargeDelivered=%.2f,"
             "SoC=%.1f,SoH=%.1f,C_rate=%.3f,CycleCount=%d,VoltageSlope=%.4f,ChargingTime=%.2f,DischargingTime=%.2f,"
             "RuntimeToCutoff=%.2f,Efficiency=%.2f,MaxVoltage=%.2f,MinVoltage=%.2f,InternalResistance=%.4f,"
             "ChargingState=%di,ChargingPhase=%d,Pressure=%.2f,Altitude=%.2f,WiFiRSSI=%d",
             Location.c_str(), DeviceID, 0UL,
             Config.c_str(), FirmwareVersion.c_str(),
             safeFloat(temperature), safeFloat(energy_wh), safeFloat(charge_delivered_mah), safeFloat(discharge_delivered_mah),
             safeFloat(soc_percent), safeFloat(soh_percent), safeFloat(c_rate), battery_cycle_count, safeFloat(voltage_slope), safeFloat(charging_time_s / 60.0), safeFloat(discharging_time_s / 60.0),
             safeFloat(runtime_to_cutoff_s / 3600.0), safeFloat(efficiency), safeFloat(max_voltage), safeFloat(min_voltage, 999.0f), safeFloat(internal_resistance),
             status_code, charging_phase_code, safeFloat(bmp_press), safeFloat(bmp_altitude), wifi_rssi);
  }
  else // send when TEST is ON
  {
    snprintf(msg, sizeof(msg),
             "BatteryLogger,Location=%s,Device=%s,TestStartTime=%lu "
             "Config=\"%s\",OtaEnabled=1i,FirmwareVersion=\"%s\",Voltage=%.2f,Current=%.3f,Power=%.2f,Temperature=%.2f,Energy=%.2f,ChargeDelivered=%.2f,DischargeDelivered=%.2f,"
             "SoC=%.1f,SoH=%.1f,C_rate=%.3f,CycleCount=%d,VoltageSlope=%.4f,ChargingTime=%.2f,DischargingTime=%.2f,"
             "RuntimeToCutoff=%.2f,Efficiency=%.2f,MaxVoltage=%.2f,MinVoltage=%.2f,InternalResistance=%.4f,"
             "ChargingState=%di,ChargingPhase=%d,Pressure=%.2f,Altitude=%.2f,WiFiRSSI=%d",
             Location.c_str(), DeviceID, tt,
             Config.c_str(), FirmwareVersion.c_str(),
             safeFloat(voltage_v), safeFloat(current_a), safeFloat(power_w), safeFloat(temperature), safeFloat(energy_wh), safeFloat(charge_delivered_mah), safeFloat(discharge_delivered_mah),
             safeFloat(soc_percent), safeFloat(soh_percent), safeFloat(c_rate), battery_cycle_count, safeFloat(voltage_slope), safeFloat(charging_time_s / 60.0), safeFloat(discharging_time_s / 60.0),
             safeFloat(runtime_to_cutoff_s / 3600.0), safeFloat(efficiency), safeFloat(max_voltage), safeFloat(min_voltage, 999.0f), safeFloat(internal_resistance),
             status_code, charging_phase_code, safeFloat(bmp_press), safeFloat(bmp_altitude), wifi_rssi);
  }
  
  // Append timestamp in nanoseconds format
  char ts_buf[32];
  snprintf(ts_buf, sizeof(ts_buf), " %lu000000000", Epoch_Time);
  strcat(msg, ts_buf);

  if (WiFi.status() == WL_CONNECTED && client.connected()) {
    Serial.println("Publishing to MQTT station topic:");
    Serial.println(msg);
    if (client.publish("station", msg)) {
      last_mqtt_publish_time = millis();
      digitalWrite(DataTxLed, LOW);
      sendOfflineLogs();
      return;
    }
  }

  // Save to offline storage if publication fails or if we are offline
  Serial.println("Network offline or MQTT publish failed. Storing message to local flash buffer...");
  saveToOfflineLog(msg);
  digitalWrite(DataTxLed, LOW);
}
