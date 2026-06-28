
//config.h >> setupFunctions.h >> sensorFunctions.h >> FullFuntion.ino
#include "config.h"
#include <FS.h>
#include <SPIFFS.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_INA260.h>
#include <Adafruit_BMP280.h>
#include <math.h>

inline float safeFloat(float val, float fallback = 0.0f) {
  return (isnan(val) || isinf(val)) ? fallback : val;
}

WiFiClient espClient;
PubSubClient client(espClient);
Preferences preferences;
unsigned long Epoch_Time; // Variable to hold current epoch timestamp
const char* ntpServer = "time.nplindia.org"; // NTP server to request epoch time
Adafruit_MCP9600 mcp; //initialise thermocouple sensor

// OLED, INA260 and BME280 instances
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Adafruit_INA260 ina260 = Adafruit_INA260();
Adafruit_BMP280 bmp;

// DEFAULT STATES--------------------------------------------------------------------------------------------------------

// Button and State Variables
int StationOn;                          // Station Default State
int TestButtonState = 0;                // Test Status Button (0 = Off, 1 = On)
bool has_thermocouple = false;          // True if MCP9600 is present

// Previous Default States to run Code once at Bit High
int Station_Cycles_Prestate = 0;
int TestTimeMemPrestate = 0;

// SENSOR DATA VARIABLES-------------------------------------------------------------------------------------------------
float temperature;                      // Used for MCP9600 Thermocouple or BME280 fallback

// Single Button variables
int buttonStatePrevious = LOW;
unsigned long buttonPressTime = 0;
bool buttonActive = false;
unsigned long buttonLastDebounceTime = 0;
const unsigned long debounceDelay = 50;

// OLED Display parameters
int current_screen = 0;
const int total_screens = 4;
unsigned long last_display_update = 0;
const unsigned long DISPLAY_UPDATE_INTERVAL_MS = 500;
unsigned long last_display_switch = 0;
const unsigned long SCREEN_SWITCH_INTERVAL_MS = 10000;
unsigned long last_mqtt_publish_time = 0;
unsigned long last_mqtt_receive_time = 0;


// Battery logging parameters (from LFP battery logger, excluding config, slope, efficiency, internal_resistance)
float NOMINAL_CAPACITY_MAH = 0.0;
bool capacity_detected = false;
float FULL_VOLTAGE = 0.0;
float CUTOFF_VOLTAGE = 0.0;
float energy_wh = 0.0;
float soc_percent = 100.0;
float soh_percent = 100.0;
float cumulative_charge_mah = 0.0;
float charge_delivered_mah = 0.0;
float discharge_delivered_mah = 0.0;
int battery_cycle_count = 0; 
float last_voltage = 0.0;
float max_voltage = 0.0;
float min_voltage = 999.0;
float charging_time_s = 0.0;
float discharging_time_s = 0.0;
float runtime_to_cutoff_s = 0.0;
String battery_status = "Idle";
String last_status = "Idle";
unsigned long last_time_ms = 0;
String charging_phase = "Unknown";
String FirmwareVersion = "1.0.0";

// Persistent detected battery type state variables
bool is_lfp = true;
int series_cells = 4;
String last_guessed_name = "";

// Kalman Filter variables for Internal Resistance estimation
float kf_ir_estimate = 0.0;      // State estimate (Ohms) - default to 0.0
float kf_P = 0.1;                // Estimation error covariance - default to 0.1 for fast initial convergence
const float kf_Q = 1e-8;         // Process noise covariance
const float kf_R = 1e-4;         // Measurement noise covariance
const float R_fresh = 0.02;      // Healthy battery resistance (Ohms)
const float R_aged = 0.06;       // End-of-life battery resistance (Ohms)

float current_a = 0.0;
float voltage_v = 0.0;
float power_w = 0.0;
float bmp_temp = 0.0;
float bmp_press = 0.0;
float bmp_altitude = 0.0;
bool bmp_valid = false;
float c_rate = 0.0;
float internal_resistance = 0.0; // default to 0.0
float efficiency = 0.0;          // default to 0.0
float voltage_slope = 0.0;

float soc_voltage_table[6][2] = {
  {0.0, 100.0},
  {0.0, 90.0},
  {0.0, 70.0},
  {0.0, 30.0},
  {0.0, 10.0},
  {0.0, 0.0}
};

// FUNCTION VARIABLES-------------------------------------------------------------------------------------------
unsigned int Station_Cycles_Value;    // Station Cycle
unsigned int Mature_Station_Cycles_Value;    // Station Cycle
unsigned long TestTimeMem;

// FAULT DETECTION VARIABLES-------------------------------------------------------------------------------------
int Station_testStatus;
int Station_faultStatus;

// Message Sending Interval-------------------------------------------------------------------------------------
#define INTERVAL_MESSAGE1 1000
unsigned long time_1 = 0;

#define INTERVAL_MESSAGE2 10000
unsigned long time_2 = 0;

// Forward declaration of Reset and Toggle Functions
void resetAllParameters();
void toggleTestState();
void saveParameters();
void loadParameters();
void setup_SPIFFS();
void saveToOfflineLog(const char* message);
void sendOfflineLogs();

//=================CallBack_functions====================
void callback(char* topic, byte* message, unsigned int length) {
  last_mqtt_receive_time = millis();
  Serial.print("Message arrived on topic: ");
  Serial.print(topic);
  Serial.print("| Message: ");
  String messageTemp;
  
  for (int i = 0; i < length; i++) 
  {
    Serial.print((char)message[i]);
    messageTemp += (char)message[i];
  }
  Serial.println();

  if (String(topic) == "reseterror") 
  {     
    if(messageTemp == "reset")
    { 
      Serial.println("Reset Command Received: Reseting all parameters...");
      resetAllParameters();
    }
  }
}

//=================Setup_functions====================
void setup_WiFi_OTA_Mqtt()
{
  Serial.println("Connecting to WiFi");
  Serial.println("Booting");

  // Show WiFi connection status and button guide on OLED screen during startup
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  
  display.setCursor(0, 0);
  display.println("Connecting WiFi...");
  display.println("---------------------");
  display.setCursor(0, 18);
  display.println("BUTTON INSTRUCTIONS:");
  display.setCursor(0, 30);
  display.println("- Click: Cycle Screen");
  display.setCursor(0, 42);
  display.println("- Hold 5s: Run/Stop");
  display.setCursor(0, 54);
  display.println("- Hold 10s: Reset All");
  display.display();

  setupOTA(DeviceID, mySSID, myPASSWORD);  
  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
  client.setServer(mqtt_server, 1883);
  client.setBufferSize(1024);
  client.setCallback(callback);
}

//Get_Epoch_Time() Function that gets current epoch time
unsigned long Get_Epoch_Time() 
{
  time_t now;
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("Failed to obtain time");
    return(0);
  }
  time(&now);
  return now;
}

void setup_Thermocouple()
{
  Serial.println("MCP9600 HW test");
  if (!mcp.begin(I2C_ADDRESS))
  {
    Serial.println("Sensor MCP9600 not found. Continuing without thermocouple.");
    has_thermocouple = false;
  }
  else
  {
    Serial.println("Found MCP9600!");
    mcp.setADCresolution(MCP9600_ADCRESOLUTION_18);
    mcp.setThermocoupleType(MCP9600_TYPE_K);
    mcp.setFilterCoefficient(3);
    mcp.setAlertTemperature(1, 30);
    mcp.configureAlert(1, true, true); // alert 1 enabled, rising temp
    mcp.enable(true);
    has_thermocouple = true;
    Serial.println(F("------------------------------"));
  }
}

void setup_PanelButtons()
{
  pinMode(ButtonPin, INPUT_PULLDOWN); // Unified button pin
  pinMode(WiFiLED, OUTPUT);
  pinMode(DataTxLed, OUTPUT);
}

void setup_inputSensorRelay()
{
  // Input monitoring sensor pin setup removed as requested
}

void setup_SPIFFS()
{
  if (!SPIFFS.begin(true)) {
    Serial.println("An Error has occurred while mounting SPIFFS");
  } else {
    Serial.println("SPIFFS mounted successfully");
  }
}

void setup_I2CDevices()
{
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(400000);

  // Initialize SSD1306 OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Endurance Tester");
    display.display();
    Serial.println("SSD1306 OLED initialized");
  }

  // Initialize INA260
  if (!ina260.begin(INA260_ADDR)) {
    Serial.println("Failed to find INA260");
  } else {
    Serial.println("INA260 initialized");
    ina260.setAveragingCount(INA260_COUNT_128);
    ina260.setVoltageConversionTime(INA260_TIME_140_us);
    ina260.setCurrentConversionTime(INA260_TIME_140_us);
  }

  // Initialize BMP280
  if (!bmp.begin(BMP280_ADDR)) {
    Serial.println("Failed to find BMP280");
  } else {
    Serial.println("BMP280 initialized successfully");
  }
}

void reconnect() 
{  
  // Loop until we're reconnected
  if (!client.connected()) 
  {
    Serial.print("Attempting MQTT connection...");
    
    // Create a random client ID
    String clientId = "Starwatt-"; clientId += String(random(0xffff), HEX);
    
    // Attempt to connect
    if (client.connect(clientId.c_str())) 
    {
      Serial.println("connected");
      // Once connected, publish an announcement...
      client.publish("outTopic", "hello world");
      last_mqtt_publish_time = millis();
      // ... and resubscribe
      client.subscribe("reseterror");
    }     
    else 
    {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
    }
  }
}

