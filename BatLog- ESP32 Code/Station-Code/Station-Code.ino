//config.h >> setupFunctions.h >> sensorFunctions.h >> FullFuntion.ino
#include "sensorFunctions.h"
//interval to send messages


void setup()
{
  // Initialize Serial Monitor
  Serial.begin(115200);

  setup_SPIFFS();
  setup_PanelButtons();
  setup_I2CDevices();
  setup_Thermocouple();
  setup_WiFi_OTA_Mqtt(); 
  configTime(19800, 0, ntpServer);
  
  // Wait for NTP time sync (up to 5 seconds)
  Serial.print("Synchronizing NTP time");
  struct tm timeinfo;
  int retry = 0;
  while (!getLocalTime(&timeinfo) && retry < 10) {
    delay(500);
    Serial.print(".");
    retry++;
  }
  Serial.println();
  
  loadParameters();
  last_time_ms = millis();
}

void loop()
{
    WiFiConnected();
    unsigned long current_time_ms = millis();
    
    // Calculate delta time
    float delta_t_hours = (current_time_ms - last_time_ms) / 3600000.0;
    float delta_t_seconds = (current_time_ms - last_time_ms) / 1000.0;
    last_time_ms = current_time_ms;

    readButtonState();           // read the unified button state & handles progress bar
    readSensors();               // read INA260, BME280 & Thermocouple
    updateBatteryParameters(delta_t_hours, delta_t_seconds); // calculate battery stats
    updateOLED();                // refresh SSD1306 display screens
    
    client.loop();  
   
    if (millis() > time_1 + INTERVAL_MESSAGE1) 
    {
      time_1 = millis();
      StationoutputPrams();
      
      // Save parameters to NVS only when cycles change or at a 5-minute interval to prevent flash wear
      static unsigned int last_saved_st_cycles = 999999;
      static int last_saved_bat_cycles = -1;
      static unsigned long last_save_time = 0;
      if (Station_Cycles_Value != last_saved_st_cycles || 
          battery_cycle_count != last_saved_bat_cycles || 
          (current_time_ms - last_save_time >= 300000)) 
      {
        saveParameters();
        last_saved_st_cycles = Station_Cycles_Value;
        last_saved_bat_cycles = battery_cycle_count;
        last_save_time = current_time_ms;
        Serial.println("Telemetry parameters persisted to NVS.");
      }
    }

    if (millis() > time_2 + INTERVAL_MESSAGE2) 
    {
      time_2 = millis();
      if (!client.connected()) 
      {
        reconnect();
      }
    }
}

