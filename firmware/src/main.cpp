/*
==========================================================
ESP32 + micro-ROS + ROS2 Jazzy + L298N
Robot diferencial

Topico:
    /cmd_vel

linear.x
    +1 adelante
    -1 atrás

angular.z
    +1 izquierda
    -1 derecha
==========================================================
*/

#include <Arduino.h>
#include <WiFi.h>
#include <micro_ros_arduino.h>

#include <rcl/rcl.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>

#include <geometry_msgs/msg/twist.h>

#include <driver/ledc.h>

/*=========================================================
  WIFI
=========================================================*/

char ssid[] = "Red123";
char password[] = "red1234.567";

char agent_ip[] = "192.168.43.220";
uint32_t agent_port = 8888;

/*=========================================================
  L298N
=========================================================*/

#define ENA 25
#define IN1 26
#define IN2 27

#define ENB 33
#define IN3 32
#define IN4 14

/*=========================================================
  PWM ESP32
=========================================================*/

#define PWM_FREQ       1000
#define PWM_RESOLUTION LEDC_TIMER_10_BIT
#define PWM_TIMER      LEDC_TIMER_0

#define PWM_LEFT   LEDC_CHANNEL_0
#define PWM_RIGHT  LEDC_CHANNEL_1

/*=========================================================
  SEGURIDAD
=========================================================*/

const uint32_t CMD_TIMEOUT_MS = 1000;

unsigned long last_cmd_time = 0;

/*=========================================================
  ROS
=========================================================*/

rcl_node_t node;
rcl_subscription_t subscriber;
rclc_executor_t executor;
rclc_support_t support;

geometry_msgs__msg__Twist twist_msg;

/*=========================================================
  MACROS
=========================================================*/

#define RCCHECK(fn)                                                \
{                                                                  \
  rcl_ret_t temp_rc = fn;                                          \
  if (temp_rc != RCL_RET_OK)                                       \
  {                                                                \
    Serial.printf("ERROR LINEA %d rc=%d\n", __LINE__, temp_rc);    \
    while(1) delay(100);                                           \
  }                                                                \
}

/*=========================================================
  PWM
=========================================================*/

void setupPWM()
{
  ledc_timer_config_t timer_conf =
  {
    .speed_mode = LEDC_LOW_SPEED_MODE,
    .duty_resolution = PWM_RESOLUTION,
    .timer_num = PWM_TIMER,
    .freq_hz = PWM_FREQ,
    .clk_cfg = LEDC_AUTO_CLK
  };

  ledc_timer_config(&timer_conf);

  ledc_channel_config_t left_channel =
  {
    .gpio_num = ENA,
    .speed_mode = LEDC_LOW_SPEED_MODE,
    .channel = PWM_LEFT,
    .timer_sel = PWM_TIMER,
    .duty = 0,
    .hpoint = 0
  };

  ledc_channel_config_t right_channel =
  {
    .gpio_num = ENB,
    .speed_mode = LEDC_LOW_SPEED_MODE,
    .channel = PWM_RIGHT,
    .timer_sel = PWM_TIMER,
    .duty = 0,
    .hpoint = 0
  };

  ledc_channel_config(&left_channel);
  ledc_channel_config(&right_channel);
}

/*=========================================================
  MOTORES
=========================================================*/

void stopMotors()
{
  ledc_set_duty(
      LEDC_LOW_SPEED_MODE,
      PWM_LEFT,
      0);

  ledc_update_duty(
      LEDC_LOW_SPEED_MODE,
      PWM_LEFT);

  ledc_set_duty(
      LEDC_LOW_SPEED_MODE,
      PWM_RIGHT,
      0);

  ledc_update_duty(
      LEDC_LOW_SPEED_MODE,
      PWM_RIGHT);

  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);

  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}

void setLeftMotor(float speed)
{
  speed = constrain(speed, -1.0, 1.0);

  uint32_t pwm =
      (uint32_t)(fabs(speed) * 1023);

  if(speed > 0)
  {
    digitalWrite(IN1, HIGH);
    digitalWrite(IN2, LOW);
  }
  else if(speed < 0)
  {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, HIGH);
  }
  else
  {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, LOW);
  }

  ledc_set_duty(
      LEDC_LOW_SPEED_MODE,
      PWM_LEFT,
      pwm);

  ledc_update_duty(
      LEDC_LOW_SPEED_MODE,
      PWM_LEFT);
}

void setRightMotor(float speed)
{
  speed = constrain(speed, -1.0, 1.0);

  uint32_t pwm =
      (uint32_t)(fabs(speed) * 1023);

  if(speed > 0)
  {
    digitalWrite(IN3, HIGH);
    digitalWrite(IN4, LOW);
  }
  else if(speed < 0)
  {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, HIGH);
  }
  else
  {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, LOW);
  }

  ledc_set_duty(
      LEDC_LOW_SPEED_MODE,
      PWM_RIGHT,
      pwm);

  ledc_update_duty(
      LEDC_LOW_SPEED_MODE,
      PWM_RIGHT);
}

/*=========================================================
  CALLBACK CMD_VEL
=========================================================*/

void cmd_vel_callback(const void * msg_in)
{
  const geometry_msgs__msg__Twist * msg =
      (const geometry_msgs__msg__Twist *) msg_in;

  last_cmd_time = millis();

  float linear =
      constrain(msg->linear.x, -1.0, 1.0);

  float angular =
      constrain(msg->angular.z, -1.0, 1.0);

  float left =
      constrain(linear - angular, -1.0, 1.0);

  float right =
      constrain(linear + angular, -1.0, 1.0);

  setLeftMotor(left);
  setRightMotor(right);

  Serial.printf(
      "LIN=%.2f ANG=%.2f L=%.2f R=%.2f\n",
      linear,
      angular,
      left,
      right);
}

/*=========================================================
  SETUP
=========================================================*/

void setup()
{
  Serial.begin(115200);

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);

  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  setupPWM();

  stopMotors();

  // === TEST DE MOTORES (5 segundos) ===
  Serial.println("TEST PWM");

  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
  ledc_set_duty(LEDC_LOW_SPEED_MODE, PWM_LEFT, 972);
  ledc_update_duty(LEDC_LOW_SPEED_MODE, PWM_LEFT);
  ledc_set_duty(LEDC_LOW_SPEED_MODE, PWM_RIGHT, 972);
  ledc_update_duty(LEDC_LOW_SPEED_MODE, PWM_RIGHT);
  delay(5000);
  stopMotors();
  // ================================

  // Conectar WiFi explícitamente con diagnóstico
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Conectando WiFi");
  int wifi_attempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifi_attempts < 40)
  {
    delay(500);
    Serial.print(".");
    wifi_attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.print("WiFi OK, IP: ");
    Serial.println(WiFi.localIP());
  }
  else
  {
    Serial.print("WiFi FALLO (codigo ");
    Serial.print(WiFi.status());
    Serial.println("):");
    switch (WiFi.status())
    {
      case WL_NO_SSID_AVAIL: Serial.println("  Red no encontrada"); break;
      case WL_CONNECT_FAILED: Serial.println("  Contrasena incorrecta"); break;
      case WL_IDLE_STATUS: Serial.println("  Timeout de conexion"); break;
      default: Serial.println("  Error desconocido"); break;
    }
    while (1) delay(100);
  }

  set_microros_wifi_transports(
      ssid,
      password,
      agent_ip,
      agent_port);

  // Esperar a que el transporte WiFi+micro-ROS se estabilice
  delay(3000);

  Serial.println("Listo para micro-ROS");
  Serial.printf("Heap libre: %d bytes\n", ESP.getFreeHeap());

  rcl_allocator_t allocator =
      rcl_get_default_allocator();

  RCCHECK(
      rclc_support_init(
          &support,
          0,
          NULL,
          &allocator));

  RCCHECK(
      rclc_node_init_default(
          &node,
          "esp32_robot",
          "",
          &support));

  RCCHECK(
      rclc_subscription_init_default(
          &subscriber,
          &node,
          ROSIDL_GET_MSG_TYPE_SUPPORT(
              geometry_msgs,
              msg,
              Twist),
          "/cmd_vel"));

  RCCHECK(
      rclc_executor_init(
          &executor,
          &support.context,
          1,
          &allocator));

  RCCHECK(
      rclc_executor_add_subscription(
          &executor,
          &subscriber,
          &twist_msg,
          &cmd_vel_callback,
          ON_NEW_DATA));

  last_cmd_time = millis();

  Serial.println("Robot listo");
}

/*=========================================================
  LOOP
=========================================================*/

void loop()
{
  rclc_executor_spin_some(
      &executor,
      RCL_MS_TO_NS(10));

  if(millis() - last_cmd_time >
     CMD_TIMEOUT_MS)
  {
    stopMotors();
  }

  delay(10);
}
