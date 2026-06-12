const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  ExternalHyperlink, PageBreak,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, TabStopType, TabStopPosition,
} = require("docx");

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const CELL_MARGINS = { top: 60, bottom: 60, left: 100, right: 100 };
const ACCENT = "1F4E79";
const BG_HEADER = "D6E4F0";
const BG_ROW = "F2F2F2";

function headerCell(text, width) {
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: BG_HEADER, type: ShadingType.CLEAR },
    margins: CELL_MARGINS,
    verticalAlign: "center",
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, font: "Arial", size: 20 })] })],
  });
}

function cell(text, width, opts = {}) {
  const runs = [];
  if (opts.mono) {
    runs.push(new TextRun({ text, font: "Consolas", size: 18, color: "333333" }));
  } else if (opts.bold) {
    runs.push(new TextRun({ text, bold: true, font: "Arial", size: 20 }));
  } else {
    runs.push(new TextRun({ text, font: "Arial", size: 20 }));
  }
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shading ? { fill: BG_ROW, type: ShadingType.CLEAR } : undefined,
    margins: CELL_MARGINS,
    children: [new Paragraph({ children: runs })],
  });
}

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 }, children: [new TextRun({ text, bold: true, font: "Arial", size: 32, color: ACCENT })] });
}

function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 160 }, children: [new TextRun({ text, bold: true, font: "Arial", size: 26, color: "2E75B6" })] });
}

function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 }, children: [new TextRun({ text, bold: true, font: "Arial", size: 22, color: "333333" })] });
}

function p(text, opts = {}) {
  const runs = [];
  if (opts.mono) {
    runs.push(new TextRun({ text, font: "Consolas", size: 18 }));
  } else if (opts.bold) {
    runs.push(new TextRun({ text, bold: true, font: "Arial", size: 22 }));
  } else if (opts.italic) {
    runs.push(new TextRun({ text, italics: true, font: "Arial", size: 22 }));
  } else {
    runs.push(new TextRun({ text, font: "Arial", size: 22 }));
  }
  return new Paragraph({ spacing: { after: 120, line: 276 }, children: runs });
}

function bullet(text, ref = "bullets") {
  return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60, line: 276 }, children: [new TextRun({ text, font: "Arial", size: 22 })] });
}

function codeBlock(text) {
  return new Paragraph({ spacing: { before: 80, after: 80 }, indent: { left: 360 }, shading: { fill: "F5F5F5", type: ShadingType.CLEAR }, children: [new TextRun({ text, font: "Consolas", size: 18 })] });
}

function spacer(h = 200) {
  return new Paragraph({ spacing: { after: h }, children: [] });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: ACCENT },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "333333" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [
    // ====== PORTADA ======
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        spacer(2400),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "Carrito RC", bold: true, font: "Arial", size: 56, color: ACCENT })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "Documentaci\u00F3n T\u00E9cnica", font: "Arial", size: 36, color: "2E75B6" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Plataforma de control por inteligencia artificial", font: "Arial", size: 24, color: "666666" })] }),
        spacer(600),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "[FOTO DEL CARRITO]", italics: true, font: "Arial", size: 22, color: "999999" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 400 }, children: [new TextRun({ text: "(Insertar fotograf\u00EDa del carrito real aqu\u00ED)", italics: true, font: "Arial", size: 18, color: "AAAAAA" })] }),
        spacer(800),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Junio 2026", font: "Arial", size: 22, color: "888888" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Versi\u00F3n 1.0", font: "Arial", size: 22, color: "888888" })] }),
      ],
    },

    // ====== TABLA DE CONTENIDO ======
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Carrito RC \u2014 Documentaci\u00F3n T\u00E9cnica", font: "Arial", size: 16, color: "999999", italics: true })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "P\u00E1gina ", font: "Arial", size: 18, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "999999" })] })] }) },
      children: [
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "\u00CDndice", bold: true, font: "Arial", size: 32, color: ACCENT })] }),
        new TableOfContents("Tabla de contenido", { hyperlink: true, headingStyleRange: "1-3" }),
      ],
    },

    // ====== 1. INTRODUCCIÓN ======
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Carrito RC \u2014 Documentaci\u00F3n T\u00E9cnica", font: "Arial", size: 16, color: "999999", italics: true })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "P\u00E1gina ", font: "Arial", size: 18, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "999999" })] })] }) },
      children: [
        h1("1. Introducci\u00F3n"),
        p("Carrito RC es una plataforma de microservicios que permite controlar un carro rob\u00F3tico con tracci\u00F3n diferencial mediante comandos en lenguaje natural. El sistema utiliza inteligencia artificial para interpretar \u00F3rdenes del usuario combinadas con visi\u00F3n computacional en tiempo real, generando acciones de movimiento que se ejecutan sobre un ESP32 conectado por WiFi."),
        p("El proyecto integra un pipeline completo desde la interfaz web hasta los motores f\u00EDsicos del carrito, demostrando c\u00F3mo la rob\u00F3tica moderna puede combinarse con servicios de IA en la nube."),
        h2("1.1 Flujo de datos"),
        p("Frontend \u2192 api-gateway:8080 \u2192 vlm-service \u2192 llm-service \u2192 ros2-bridge \u2192 micro-ros-agent \u2192 ESP32 (WiFi/UDP), con instruction-service persistiendo en MongoDB Atlas.", { bold: true }),
        spacer(),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 }, children: [new TextRun({ text: "[DIAGRAMA DE ARQUITECTURA]", italics: true, font: "Arial", size: 22, color: "999999" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 200 }, children: [new TextRun({ text: "(Insertar diagrama de flujo de microservicios aqu\u00ED)", italics: true, font: "Arial", size: 18, color: "AAAAAA" })] }),
        h2("1.2 Repositorio"),
        p("El c\u00F3digo fuente completo est\u00E1 disponible en el repositorio del proyecto. La estructura principal es:"),
        bullet("docker-compose.yml \u2014 orquestaci\u00F3n de todos los servicios"),
        bullet("services/ \u2014 seis microservicios en Python y ROS2"),
        bullet("frontend/ \u2014 interfaz de usuario React/Vite"),
        bullet("firmware/ \u2014 c\u00F3digo del ESP32 en Arduino/PlatformIO"),
      ],
    },

    // ====== 2. ARQUITECTURA ======
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Carrito RC \u2014 Documentaci\u00F3n T\u00E9cnica", font: "Arial", size: 16, color: "999999", italics: true })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "P\u00E1gina ", font: "Arial", size: 18, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "999999" })] })] }) },
      children: [
        h1("2. Arquitectura del sistema"),
        p("La plataforma sigue una arquitectura de microservicios sobre Docker, con cada servicio encapsulado en su propio contenedor y comunic\u00E1ndose a trav\u00E9s de la red bridge interna llamada ros2net."),

        h2("2.1 Mapa de servicios"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2200, 2000, 2000, 3160],
          rows: [
            new TableRow({ children: [headerCell("Servicio", 2200), headerCell("Stack", 2000), headerCell("Puerto", 2000), headerCell("Rol", 3160)] }),
            new TableRow({ children: [cell("api-gateway", 2200, { bold: true }), cell("FastAPI + httpx", 2000), cell("8080", 2000, { mono: true }), cell("Orquestador del flujo completo; \u00FAnico expuesto al frontend", 3160)] }),
            new TableRow({ children: [cell("vlm-service", 2200, { bold: true, shading: true }), cell("FastAPI + OpenAI SDK", 2000, { shading: true }), cell("8000", 2000, { mono: true, shading: true }), cell("Captura c\u00E1mara IP y describe escena con Gemini VLM", 3160, { shading: true })] }),
            new TableRow({ children: [cell("llm-service", 2200, { bold: true }), cell("FastAPI + OpenAI SDK", 2000), cell("8000", 2000, { mono: true }), cell("Decide acci\u00F3n de movimiento coherente (orden + visi\u00F3n)", 3160)] }),
            new TableRow({ children: [cell("instruction-service", 2200, { bold: true, shading: true }), cell("FastAPI + Motor", 2000, { shading: true }), cell("8000", 2000, { mono: true, shading: true }), cell("Persiste historial en MongoDB Atlas", 3160, { shading: true })] }),
            new TableRow({ children: [cell("ros2-bridge", 2200, { bold: true }), cell("ROS2 Jazzy + rclpy", 2000), cell("8001", 2000, { mono: true }), cell("Recibe acciones y publica /cmd_vel en ROS2", 3160)] }),
            new TableRow({ children: [cell("frontend", 2200, { bold: true, shading: true }), cell("React/Vite + nginx", 2000, { shading: true }), cell("5173", 2000, { mono: true, shading: true }), cell("SPA con panel de control tipo cockpit", 3160, { shading: true })] }),
            new TableRow({ children: [cell("micro-ros-agent", 2200, { bold: true }), cell("micro-ROS Jazzy", 2000), cell("8888/udp", 2000, { mono: true }), cell("Gateway UDP entre ROS2 y el ESP32", 3160)] }),
          ],
        }),

        h2("2.2 Red y comunicaci\u00F3n"),
        bullet("Todos los servicios en la red bridge ros2net (Docker Desktop)."),
        bullet("api-gateway:8080 es el \u00FAnico servicio expuesto al frontend."),
        bullet("micro-ros-agent mapea UDP 8888 al host para que el ESP32 se conecte por WiFi."),
        bullet("ros2-bridge y micro-ros-agent comparten ROS_DOMAIN_ID (default 0) para descubrimiento DDS."),
        bullet("El ESP32 se conecta por WiFi/UDP directamente al micro-ros-agent."),
      ],
    },

    // ====== 3. STACK TECNOLÓGICO ======
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Carrito RC \u2014 Documentaci\u00F3n T\u00E9cnica", font: "Arial", size: 16, color: "999999", italics: true })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "P\u00E1gina ", font: "Arial", size: 18, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "999999" })] })] }) },
      children: [
        h1("3. Stack tecnol\u00F3gico"),
        p("A continuaci\u00F3n se detallan las tecnolog\u00EDas utilizadas en cada capa del sistema:"),

        h2("3.1 Backend (Python)"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2200, 2000, 5160],
          rows: [
            new TableRow({ children: [headerCell("Tecnolog\u00EDa", 2200), headerCell("Versi\u00F3n", 2000), headerCell("Uso", 5160)] }),
            new TableRow({ children: [cell("Python", 2200, { bold: true }), cell("3.12", 2000), cell("Runtime base de todos los servicios", 5160)] }),
            new TableRow({ children: [cell("FastAPI", 2200, { bold: true, shading: true }), cell("\u22650.115", 2000, { shading: true }), cell("Framework web ASGI para APIs REST", 5160, { shading: true })] }),
            new TableRow({ children: [cell("httpx", 2200, { bold: true }), cell("\u22650.27", 2000), cell("Cliente HTTP as\u00EDncrono entre servicios", 5160)] }),
            new TableRow({ children: [cell("uvicorn", 2200, { bold: true, shading: true }), cell("\u22650.30", 2000, { shading: true }), cell("Servidor ASGI", 5160, { shading: true })] }),
            new TableRow({ children: [cell("Motor", 2200, { bold: true }), cell("\u22653.0", 2000), cell("Driver MongoDB as\u00EDncrono", 5160)] }),
            new TableRow({ children: [cell("OpenAI SDK", 2200, { bold: true, shading: true }), cell("\u22651.40", 2000, { shading: true }), cell("Cliente para OpenRouter (API compatible OpenAI)", 5160, { shading: true })] }),
            new TableRow({ children: [cell("uv", 2200, { bold: true }), cell("\u00FAltima", 2000), cell("Gestor de paquetes Python (reemplaza pip)", 5160)] }),
          ],
        }),

        h2("3.2 Frontend"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2200, 2000, 5160],
          rows: [
            new TableRow({ children: [headerCell("Tecnolog\u00EDa", 2200), headerCell("Versi\u00F3n", 2000), headerCell("Uso", 5160)] }),
            new TableRow({ children: [cell("React", 2200, { bold: true }), cell("18.3", 2000), cell("Framework UI", 5160)] }),
            new TableRow({ children: [cell("Vite", 2200, { bold: true, shading: true }), cell("5.4", 2000, { shading: true }), cell("Bundler y dev server", 5160, { shading: true })] }),
            new TableRow({ children: [cell("pnpm", 2200, { bold: true }), cell("9.15", 2000), cell("Gestor de paquetes Node.js", 5160)] }),
            new TableRow({ children: [cell("nginx", 2200, { bold: true, shading: true }), cell("Alpine", 2000, { shading: true }), cell("Servidor web en producci\u00F3n", 5160, { shading: true })] }),
          ],
        }),

        h2("3.3 Rob\u00F3tica y firmware"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2200, 2000, 5160],
          rows: [
            new TableRow({ children: [headerCell("Tecnolog\u00EDa", 2200), headerCell("Versi\u00F3n", 2000), headerCell("Uso", 5160)] }),
            new TableRow({ children: [cell("ESP32", 2200, { bold: true }), cell("-", 2000), cell("Microcontrolador WiFi/Bluetooth del carrito", 5160)] }),
            new TableRow({ children: [cell("micro-ROS", 2200, { bold: true, shading: true }), cell("Jazzy", 2000, { shading: true }), cell("Cliente ROS2 embebido para ESP32", 5160, { shading: true })] }),
            new TableRow({ children: [cell("ROS2", 2200, { bold: true }), cell("Jazzy", 2000), cell("Framework de rob\u00F3tica (DDS)", 5160)] }),
            new TableRow({ children: [cell("L298N", 2200, { bold: true, shading: true }), cell("-", 2000, { shading: true }), cell("Puente H para control de motores DC", 5160, { shading: true })] }),
            new TableRow({ children: [cell("IP Webcam", 2200, { bold: true }), cell("-", 2000), cell("App Android que expone la c\u00E1mara como HTTP", 5160)] }),
          ],
        }),

        h2("3.4 IA y servicios externos"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2200, 2000, 5160],
          rows: [
            new TableRow({ children: [headerCell("Servicio", 2200), headerCell("Versi\u00F3n/Modelo", 2000), headerCell("Uso", 5160)] }),
            new TableRow({ children: [cell("OpenRouter", 2200, { bold: true }), cell("-", 2000), cell("Gateway de APIs de IA (compatible OpenAI)", 5160)] }),
            new TableRow({ children: [cell("Gemini (VLM)", 2200, { bold: true, shading: true }), cell("google/gemini-2.5-flash", 2000, { shading: true }), cell("Descripci\u00F3n de escenas desde imagen", 5160, { shading: true })] }),
            new TableRow({ children: [cell("Gemini (LLM)", 2200, { bold: true }), cell("google/gemini-2.5-flash", 2000), cell("Decisi\u00F3n de acciones desde texto+visi\u00F3n", 5160)] }),
            new TableRow({ children: [cell("MongoDB Atlas", 2200, { bold: true, shading: true }), cell("-", 2000, { shading: true }), cell("Base de datos para historial de instrucciones", 5160, { shading: true })] }),
          ],
        }),
      ],
    },

    // ====== 4. API GATEWAY ======
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Carrito RC \u2014 Documentaci\u00F3n T\u00E9cnica", font: "Arial", size: 16, color: "999999", italics: true })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "P\u00E1gina ", font: "Arial", size: 18, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "999999" })] })] }) },
      children: [
        h1("4. API Gateway"),
        p("El api-gateway es el \u00FAnico punto de entrada desde el frontend. Orquesta el ciclo completo: recibe la instrucci\u00F3n del usuario, la procesa con los servicios internos y devuelve el resultado."),

        h2("4.1 Endpoints"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [1600, 1200, 6560],
          rows: [
            new TableRow({ children: [headerCell("M\u00E9todo", 1600), headerCell("Ruta", 1200), headerCell("Descripci\u00F3n", 6560)] }),
            new TableRow({ children: [cell("POST", 1600, { mono: true, bold: true }), cell("/command", 1200, { mono: true }), cell("Ejecuta el ciclo completo: captura c\u00E1mara \u2192 VLM \u2192 LLM \u2192 ROS2 \u2192 historial", 6560)] }),
            new TableRow({ children: [cell("POST", 1600, { mono: true, bold: true, shading: true }), cell("/stop", 1200, { mono: true, shading: true }), cell("Parada de emergencia: env\u00EDa linear=0, angular=0 al carrito", 6560, { shading: true })] }),
            new TableRow({ children: [cell("GET", 1600, { mono: true, bold: true }), cell("/history", 1200, { mono: true }), cell("Devuelve el hist\u00F3rico de instrucciones (?limit=50&skip=0)", 6560)] }),
            new TableRow({ children: [cell("GET", 1600, { mono: true, bold: true, shading: true }), cell("/camera/config", 1200, { mono: true, shading: true }), cell("Expone la URL de la c\u00E1mara configurada al frontend", 6560, { shading: true })] }),
            new TableRow({ children: [cell("GET", 1600, { mono: true, bold: true }), cell("/health", 1200, { mono: true }), cell("Health check del gateway", 6560)] }),
          ],
        }),

        h2("4.2 Formato del modelo de acci\u00F3n"),
        p("El LLM devuelve acciones en formato JSON estructurado con los siguientes campos:"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [1800, 1200, 1400, 4960],
          rows: [
            new TableRow({ children: [headerCell("Campo", 1800), headerCell("Rango", 1200), headerCell("Tipo", 1400), headerCell("Descripci\u00F3n", 4960)] }),
            new TableRow({ children: [cell("type", 1800, { mono: true, bold: true }), cell("-", 1200), cell("string", 1400, { mono: true }), cell("forward | backward | left | right | stop", 4960)] }),
            new TableRow({ children: [cell("linear", 1800, { mono: true, bold: true, shading: true }), cell("[-1, 1]", 1200, { shading: true }), cell("number", 1400, { mono: true, shading: true }), cell("Velocidad lineal (forward positivo)", 4960, { shading: true })] }),
            new TableRow({ children: [cell("angular", 1800, { mono: true, bold: true }), cell("[-1, 1]", 1200), cell("number", 1400, { mono: true }), cell("Velocidad angular (giro positivo a la izquierda)", 4960)] }),
            new TableRow({ children: [cell("duration_s", 1800, { mono: true, bold: true, shading: true }), cell("[0, 10]", 1200, { shading: true }), cell("number", 1400, { mono: true, shading: true }), cell("Duraci\u00F3n del movimiento en segundos", 4960, { shading: true })] }),
            new TableRow({ children: [cell("reasoning", 1800, { mono: true, bold: true }), cell("-", 1200), cell("string", 1400, { mono: true }), cell("Razonamiento textual de la IA", 4960)] }),
          ],
        }),
        p("Mezcla diferencial: left = linear - angular, right = linear + angular.", { italic: true }),
      ],
    },

    // ====== 5. INSTRUCCIONES DE RÉPLICA ======
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Carrito RC \u2014 Documentaci\u00F3n T\u00E9cnica", font: "Arial", size: 16, color: "999999", italics: true })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "P\u00E1gina ", font: "Arial", size: 18, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "999999" })] })] }) },
      children: [
        h1("5. Instrucciones de r\u00E9plica"),

        h2("5.1 Prerrequisitos"),
        bullet("Docker Desktop para Windows (con WSL2 habilitado)"),
        bullet("Python 3.12+ y uv (opcional, para desarrollo fuera de Docker)"),
        bullet("Node.js 22+ y pnpm (para frontend fuera de Docker)"),
        bullet("Visual Studio Code + PlatformIO (para firmware ESP32)"),
        bullet("O Arduino IDE con micro_ros_arduino branch jazzy"),
        bullet("Una red WiFi 2.4GHz (el ESP32 no soporta 5GHz)"),
        bullet("Un tel\u00E9fono Android con la app IP Webcam instalada"),
        bullet("Puente H L298N y motores DC con alimentaci\u00F3n externa 7-12V"),

        h2("5.2 Clonar y configurar"),
        codeBlock("git clone <url-del-repositorio>"),
        codeBlock("cd pdyp-final"),
        codeBlock("cp .env.example .env"),
        p("Editar .env con los valores correctos:"),
        bullet("OPENROUTER_API_KEY: clave de API de openrouter.ai"),
        bullet("CAMERA_SNAPSHOT_URL: http://<ip-del-celular>:8080/shot.jpg"),
        bullet("MONGODB_URI: cadena de conexi\u00F3n a MongoDB Atlas"),

        h2("5.3 Levantar los servicios"),
        codeBlock("docker compose up --build"),
        p("Esto inicia los 7 contenedores. El frontend estar\u00E1 disponible en:"),
        bullet("http://localhost:5173 (desde el navegador)"),
        p("Para desarrollo de un servicio individual fuera de Docker:"),
        codeBlock("cd services/<nombre>"),
        codeBlock("uv run uvicorn app.main:app --reload --port 8000"),
        p("Para el frontend fuera de Docker:"),
        codeBlock("cd frontend"),
        codeBlock("pnpm install"),
        codeBlock("pnpm dev  # servidor en :5173"),

        h2("5.4 Firmware del ESP32"),

        h3("5.4.1 Conexiones el\u00E9ctricas (L298N)"),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 }, children: [new TextRun({ text: "[DIAGRAMA DE CONEXIONES]", italics: true, font: "Arial", size: 22, color: "999999" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 200 }, children: [new TextRun({ text: "(Insertar diagrama de conexiones ESP32 + L298N + motores aqu\u00ED)", italics: true, font: "Arial", size: 18, color: "AAAAAA" })] }),

        p("Conexi\u00F3n de pines ESP32 al L298N:"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2000, 2000, 2000, 3360],
          rows: [
            new TableRow({ children: [headerCell("ESP32", 2000), headerCell("L298N", 2000), headerCell("Funci\u00F3n", 2000), headerCell("Nota", 3360)] }),
            new TableRow({ children: [cell("GPIO 25", 2000, { mono: true, bold: true }), cell("ENA", 2000, { mono: true }), cell("PWM motor izquierdo", 2000), cell("Remover jumper ENA", 3360)] }),
            new TableRow({ children: [cell("GPIO 26", 2000, { mono: true, bold: true, shading: true }), cell("IN1", 2000, { mono: true, shading: true }), cell("Direcci\u00F3n motor izquierdo", 2000, { shading: true }), cell("-", 3360, { shading: true })] }),
            new TableRow({ children: [cell("GPIO 27", 2000, { mono: true, bold: true }), cell("IN2", 2000, { mono: true }), cell("Direcci\u00F3n motor izquierdo", 2000), cell("-", 3360)] }),
            new TableRow({ children: [cell("GPIO 33", 2000, { mono: true, bold: true, shading: true }), cell("ENB", 2000, { mono: true, shading: true }), cell("PWM motor derecho", 2000, { shading: true }), cell("Remover jumper ENB", 3360, { shading: true })] }),
            new TableRow({ children: [cell("GPIO 32", 2000, { mono: true, bold: true }), cell("IN3", 2000, { mono: true }), cell("Direcci\u00F3n motor derecho", 2000), cell("-", 3360)] }),
            new TableRow({ children: [cell("GPIO 14", 2000, { mono: true, bold: true, shading: true }), cell("IN4", 2000, { mono: true, shading: true }), cell("Direcci\u00F3n motor derecho", 2000, { shading: true }), cell("-", 3360, { shading: true })] }),
            new TableRow({ children: [cell("GND", 2000, { mono: true, bold: true }), cell("GND", 2000, { mono: true }), cell("Referencia com\u00FAn", 2000), cell("Compartir tierra con la fuente de poder", 3360)] }),
          ],
        }),
        spacer(120),
        p("Alimentaci\u00F3n:", { bold: true }),
        bullet("Conectar la bater\u00EDa (7-12V) al terminal VS/12V del L298N (NO al terminal 5V)."),
        bullet("El terminal 5V del L298N puede alimentar el ESP32 si no supera los 500mA."),
        bullet("Compartir GND entre la bater\u00EDa, el L298N y el ESP32."),

        h3("5.4.2 Cargar el firmware"),
        p("Con PlatformIO:"),
        codeBlock("cd firmware"),
        codeBlock("# Editar src/main.cpp: ssid, password, agent_ip"),
        codeBlock("pio run -t upload"),
        p("O con Arduino IDE:"),
        bullet("Instalar micro_ros_arduino desde el branch jazzy (ZIP de GitHub)."),
        bullet("NO usar la versi\u00F3n 2.0.8 del branch main (es para Humble)."),
        bullet("Abrir firmware/src/main.cpp, seleccionar placa ESP32 Dev Module y flashear."),

        h3("5.4.3 Par\u00E1metros configurables en main.cpp"),
        codeBlock('char ssid[] = "Red123";           // WiFi SSID (2.4GHz)'),
        codeBlock('char password[] = "password";     // WiFi password'),
        codeBlock('char agent_ip[] = "192.168.1.35"; // IP del PC que corre micro-ros-agent'),
        codeBlock("uint32_t agent_port = 8888;"),

        h2("5.5 Verificaci\u00F3n del sistema"),
        p("Una vez todo funcionando, el flujo completo se verifica con:"),
        bullet("1. Abrir http://localhost:5173 en el navegador."),
        bullet("2. Confirmar que la c\u00E1mara IP se ve en el viewport."),
        bullet("3. Enviar una instrucci\u00F3n como \"avanza un poco y detente\"."),
        bullet("4. El ESP32 debe mover los motores seg\u00FAn la acci\u00F3n decidida por la IA."),
        bullet("5. Verificar el hist\u00F3rico de instrucciones en el panel lateral."),
        p("Para debug remoto dentro del contenedor ros2-bridge:", { mono: true }),
        codeBlock("docker compose exec ros2-bridge bash"),
        codeBlock("source /opt/ros/jazzy/setup.bash"),
        codeBlock("ros2 topic echo /cmd_vel"),
      ],
    },

    // ====== 6. CONSIDERACIONES ======
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Carrito RC \u2014 Documentaci\u00F3n T\u00E9cnica", font: "Arial", size: 16, color: "999999", italics: true })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "P\u00E1gina ", font: "Arial", size: 18, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "999999" })] })] }) },
      children: [
        h1("6. Consideraciones importantes"),

        h2("6.1 Red WiFi"),
        bullet("El ESP32 solo funciona en redes 2.4GHz. No es compatible con 5GHz."),
        bullet("El micro-ros-agent debe ser accesible desde la misma red WiFi que el ESP32."),
        bullet("Si el internet es lento, la IA (OpenRouter) puede tardar m\u00E1s de 60s en responder. El timeout del gateway es de 120s."),
        bullet("La IP del PC debe ser est\u00E1tica o conocida, ya que est\u00E1 hardcodeada en el firmware."),

        h2("6.2 Seguridad"),
        bullet("El .env contiene credenciales reales (API keys, URI de MongoDB). No commitees este archivo (est\u00E1 en .gitignore)."),
        bullet("La c\u00E1mara IP web expone un endpoint HTTP sin autenticaci\u00F3n. Solo debe usarse en redes de confianza."),
        bullet("CORS est\u00E1 abierto a cualquier origen. En producci\u00F3n, restringir al dominio del frontend."),

        h2("6.3 Mantenimiento del modelo de IA"),
        bullet("OpenRouter depreca modelos peri\u00F3dicamente (google/gemini-2.0-flash-001 fue deprecado el 1 de junio 2026)."),
        bullet("Si aparece \"No endpoints found\", actualizar OPENROUTER_MODEL en .env a un modelo vigente."),

        h2("6.4 Notas t\u00E9cnicas"),
        bullet("Frecuencia PWM: 500-1000Hz para motores DC con L298N (5000Hz hace que los motores zumben sin girar)."),
        bullet("No usar rmw_uros_ping_agent antes de rclc_support_init: corrompe el estado del transporte."),
        bullet("Usar set_microros_wifi_transports + delay(3000) + rclc_support_init en el firmware."),
      ],
    },
  ],
});

const OUTPUT = "docs/Carrito_RC_Documentacion_Tecnica.docx";
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUTPUT, buffer);
  console.log("Documento creado:", OUTPUT);
});
