
//config.h >> setupFunctions.h >> sensorFunctions.h >> FullFuntion.ino

//Change as per station
// Important note:  change #define MQTT_MAX_PACKET_SIZE 256 to #define MQTT_MAX_PACKET_SIZE 500 in pubsubclient.h file


const char* DeviceID = "BatLog"; // used to display correct device name on Network port during OTA upload
String Config = "Undetected";
String Location = "Starwatt-Lab";
const char* mySSID = "WORKSTATION"; //"Philips 4G"  //"WORKSTATION"  //Starwatt_IoT
const char* myPASSWORD = "Superman_27"; //"Philips123" //"Superman_27"    
const char* mqtt_server = "69.62.73.206";  // Static IP for Philips
//const char* mqtt_server = "broker.emqx.io";  // Static IP for Philips
//const char* mqtt_server = "192.168.1.3";  // Static IP for Philips


#define MSG_BUFFER_SIZE  (1024) // Increased variable to hold mqtt messages with extra battery logs
char msg[MSG_BUFFER_SIZE];

#define I2C_ADDRESS (0x67)                   //// 0x67 for original Adafruit, 0x66 for Pimorni MCP9600 Thermocouple
#define INA260_ADDR (0x40)                   //// I2C address for INA260
#define BMP280_ADDR (0x76)                   //// I2C address for BMP280
#define SCREEN_ADDRESS (0x3C)                //// OLED display I2C address
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define I2C_SDA 21
#define I2C_SCL 22

// DEFINE PINS -------------------------------------------------------------------------------------
const int ButtonPin = 4;                 // Single Button Pin for Start/Reset/OLED Navigation
const int WiFiLED = 23;  
//const int DataTxLed = 2; //using d2 only for test v1 pcb
const int DataTxLed = 33; //use pin 33 V2 only, 
