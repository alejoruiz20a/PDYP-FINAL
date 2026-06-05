/*
==========================================================
ROBOT DIFERENCIAL ROS2 + MICRO-ROS + ESP32 + L298N
Versión: 1.0 Producción
==========================================================

Topico ROS:
    /cmd_vel

Control:
    linear.x  -> avance/retroceso
    angular.z -> giro

Hardware:
    ESP32 DevKit V1
    L298N
    2 Motores DC

==========================================================
*/

#include <Arduino.h>
#include <micro_ros_arduino.h>

#include <rcl/rcl.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>

#include <geometry_msgs/msg/twist.h>

/*=========================================================
  CONFIGURACIÓN WIFI
=========================================================*/

// IMPORTANTE: pon aquí el nombre y contraseña de TU red WiFi
// (debe ser la misma red a la que conectas el celular con la cámara).
char ssid[] = "TU_RED_WIFI";
char password[] = "TU_PASSWORD_WIFI";

// IP de tu PC en la red local (donde corre Docker Desktop / el micro-ros-agent).
// Verifícala con `ipconfig` en Windows; puede cambiar si reinicias el router.
char agent_ip[] = "192.168.1.35";
uint32_t agent_port = 8888;

/*=========================================================
  PINES L298N
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

#define PWM_FREQ       5000
#define PWM_RESOLUTION 8

#define CH_LEFT  0
#define CH_RIGHT 1

/*=========================================================
  SEGURIDAD
=========================================================*/

// Si no llega cmd_vel durante este tiempo
// el robot se detiene automáticamente.

const uint32_t CMD_TIMEOUT_MS = 1000;

unsigned long last_cmd_time = 0;

/*=========================================================
  ROS2
=========================================================*/

rcl_node_t node;
rcl_subscription_t subscriber;
rclc_executor_t executor;
rclc_support_t support;

geometry_msgs__msg__Twist twist_msg;

/*=========================================================
  MACROS
=========================================================*/

#define RCCHECK(fn)                                      \
{                                                        \
  rcl_ret_t temp_rc = fn;                                \
  if ((temp_rc != RCL_RET_OK))                           \
  {                                                      \
    Serial.printf("ERROR LINEA %d\n", __LINE__);         \
    while (1) delay(100);                                \
  }                                                      \
}

/*=========================================================
  FUNCIONES MOTOR
=========================================================*/

void stopMotors()
{
  ledcWrite(CH_LEFT, 0);
  ledcWrite(CH_RIGHT, 0);

  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);

  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}

void setLeftMotor(float speed)
{
  speed = constrain(speed, -1.0, 1.0);

  uint8_t pwm = abs(speed) * 255;

  if (speed > 0)
  {
    digitalWrite(IN1, HIGH);
    digitalWrite(IN2, LOW);
  }
  else if (speed < 0)
  {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, HIGH);
  }
  else
  {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, LOW);
  }

  ledcWrite(CH_LEFT, pwm);
}

void setRightMotor(float speed)
{
  speed = constrain(speed, -1.0, 1.0);

  uint8_t pwm = abs(speed) * 255;

  if (speed > 0)
  {
    digitalWrite(IN3, HIGH);
    digitalWrite(IN4, LOW);
  }
  else if (speed < 0)
  {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, HIGH);
  }
  else
  {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, LOW);
  }

  ledcWrite(CH_RIGHT, pwm);
}

/*=========================================================
  CALLBACK CMD_VEL
=========================================================*/

void cmd_vel_callback(const void * msg_in)
{
  const geometry_msgs__msg__Twist * msg =
      (const geometry_msgs__msg__Twist *)msg_in;

  last_cmd_time = millis();

  float linear  = constrain(msg->linear.x, -1.0, 1.0);
  float angular = constrain(msg->angular.z, -1.0, 1.0);

  /*
      Mezcla diferencial

      linear = avance
      angular = giro
  */

  float left  = linear - angular;
  float right = linear + angular;

  left  = constrain(left,  -1.0, 1.0);
  right = constrain(right, -1.0, 1.0);

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

  stopMotors();

  // PWM ESP32

  ledcSetup(CH_LEFT, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(ENA, CH_LEFT);

  ledcSetup(CH_RIGHT, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(ENB, CH_RIGHT);

  //prueba de pwm
  Serial.println("TEST PWM");

digitalWrite(IN1, HIGH);
digitalWrite(IN2, LOW);

digitalWrite(IN3, HIGH);
digitalWrite(IN4, LOW);

ledcWrite(CH_LEFT, 255);
ledcWrite(CH_RIGHT, 255);

delay(5000);

stopMotors();

//fin prueba



  Serial.println("Conectando micro-ROS...");

  set_microros_wifi_transports(
      ssid,
      password,
      agent_ip,
      agent_port);

  while (!rmw_uros_ping_agent(1000, 1))
  {
    Serial.println("Esperando agente...");
    delay(1000);
  }

  Serial.println("Agente encontrado");

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

  // Seguridad:
  // Si se pierde comunicación ROS2
  // el robot se detiene.

  if (millis() - last_cmd_time > CMD_TIMEOUT_MS)
  {
    stopMotors();
  }

  delay(10);
}