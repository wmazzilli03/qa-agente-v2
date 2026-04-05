// mcp-server/tools/steps.tools.ts

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

// Ruta base del proyecto Cypress
const CYPRESS_BASE = "D:/QA/Front/cypress_front/cypress/e2e";

export function registrarStepsTools(server: McpServer) {

  // ─────────────────────────────────────────────
  // TOOL 1: leer_feature
  // Lee un archivo .feature y devuelve su contenido
  // ─────────────────────────────────────────────
  server.registerTool(
    "leer_feature",
    {
      title: "leer feature",
      description: "Lee un archivo .feature de Cypress y devuelve su contenido completo",
      inputSchema: {
        nombreFeature: z.string().describe(
          "Ruta relativa del feature. Ejemplo: Sprint1/login.feature"
        ),
      },
    },
    async ({ nombreFeature }) => {
      const rutaCompleta = path.join(CYPRESS_BASE, "features", nombreFeature);

      if (!fs.existsSync(rutaCompleta)) {
        return {
          content: [{
            type: "text",
            text: `❌ No se encontró el feature en: ${rutaCompleta}`,
          }],
        };
      }

      const contenido = fs.readFileSync(rutaCompleta, "utf-8");

      return {
        content: [{
          type: "text",
          text: `✅ Feature leído: ${nombreFeature}\n\n${contenido}`,
        }],
      };
    }
  );

  // ─────────────────────────────────────────────
  // TOOL 2: leer_page_object
  // Lee un Page Object (Elementos o Funciones)
  // ─────────────────────────────────────────────
  server.registerTool(
    "leer_page_object",
    {
      title: "leer page object",
      description: "Lee un archivo de Page Object del proyecto Cypress",
      inputSchema: {
        nombreArchivo: z.string().describe(
          "Ruta relativa del Page Object. Ejemplo: Login/LoginFunciones.js"
        ),
      },
    },
    async ({ nombreArchivo }) => {
      const rutaCompleta = path.join(CYPRESS_BASE, "pageObjectModel", nombreArchivo);

      if (!fs.existsSync(rutaCompleta)) {
        return {
          content: [{
            type: "text",
            text: `❌ No se encontró el Page Object en: ${rutaCompleta}`,
          }],
        };
      }

      const contenido = fs.readFileSync(rutaCompleta, "utf-8");

      return {
        content: [{
          type: "text",
          text: `✅ Page Object leído: ${nombreArchivo}\n\n${contenido}`,
        }],
      };
    }
  );

  // ─────────────────────────────────────────────
  // TOOL 3: guardar_steps
  // Guarda el archivo .ts generado en stepDefinitions/
  // ─────────────────────────────────────────────
  server.registerTool(
    "guardar_steps",
    {
      title: "guardar steps",
      description: "Guarda el archivo de step definitions generado en la carpeta correcta de Cypress",
      inputSchema: {
        nombreArchivo: z.string().describe(
          "Ruta relativa del step. Ejemplo: Sprint1/login.ts"
        ),
        contenido: z.string().describe(
          "Contenido completo del archivo .ts de step definitions"
        ),
      },
    },
    async ({ nombreArchivo, contenido }) => {
      const rutaCompleta = path.join(CYPRESS_BASE, "stepDefinitions", nombreArchivo);
      const carpeta = path.dirname(rutaCompleta);

      // Crear carpeta si no existe (ej: Sprint1/, Sprint2/)
      if (!fs.existsSync(carpeta)) {
        fs.mkdirSync(carpeta, { recursive: true });
      }

      fs.writeFileSync(rutaCompleta, contenido, "utf-8");

      return {
        content: [{
          type: "text",
          text: `✅ Steps guardados en: ${rutaCompleta}`,
        }],
      };
    }
  );

  // ─────────────────────────────────────────────
  // TOOL 4: actualizar_page_object_elementos
  // Agrega nuevos XPath a un archivo de Elementos
  // ─────────────────────────────────────────────
  server.registerTool(
    "actualizar_page_object_elementos",
    {
      title: "actualizar page object elementos",
      description: "Agrega nuevos selectores XPath a un archivo de Elementos existente. Si no conoce el XPath real deja el valor como string vacío.",
      inputSchema: {
        nombreArchivo: z.string().describe(
          "Ruta relativa del archivo de Elementos. Ejemplo: Login/LoginElementos.js"
        ),
        nuevosSelectores: z.array(
          z.object({
            nombre: z.string().describe("Nombre del selector. Ejemplo: mensajeError"),
            xpath: z.string().describe("XPath del selector. Si no se conoce dejar como string vacío")
          })
        ).describe("Lista de selectores nuevos a agregar")
      },
    },
    async ({ nombreArchivo, nuevosSelectores }) => {
    const rutaCompleta = path.join(CYPRESS_BASE, "pageObjectModel", nombreArchivo);

    if (!fs.existsSync(rutaCompleta)) {
        return {
        content: [{ type: "text", text: `❌ No se encontró el archivo: ${rutaCompleta}` }],
        };
    }

    let contenido = fs.readFileSync(rutaCompleta, "utf-8").trim();

    const selectoresNuevos = nuevosSelectores
        .map(({ nombre, xpath }) => `    ${nombre}: '${xpath}',`)
        .join("\n");

    // Si el archivo está vacío o no tiene la estructura → crearla completa
    if (!contenido.includes("export default")) {
        contenido = `const LoginElementos = {\n${selectoresNuevos}\n};\n\nexport default LoginElementos;\n`;
    } else {
        // Ya tiene estructura → insertar antes del cierre del objeto
        const indiceExport = contenido.lastIndexOf("export default");
        const indiceCierre = contenido.lastIndexOf("}", indiceExport - 1);
        contenido =
        contenido.substring(0, indiceCierre) +
        "\n" + selectoresNuevos + "\n}" +
        contenido.substring(indiceCierre + 1);
    }

    fs.writeFileSync(rutaCompleta, contenido, "utf-8");

    const nombresAgregados = nuevosSelectores.map(s => s.nombre).join(", ");
    return {
        content: [{ type: "text", text: `✅ Selectores agregados a ${nombreArchivo}: ${nombresAgregados}` }],
    };
    }
  );

  // ─────────────────────────────────────────────
  // TOOL 5: actualizar_page_object_funciones
  // Agrega nuevos métodos a un archivo de Funciones
  // ─────────────────────────────────────────────
  server.registerTool(
    "actualizar_page_object_funciones",
    {
      title: "actualizar page object funciones",
      description: "Agrega nuevos métodos a un archivo de Funciones existente usando los selectores del Page Object.",
      inputSchema: {
        nombreArchivo: z.string().describe(
          "Ruta relativa del archivo de Funciones. Ejemplo: Login/LoginFunciones.js"
        ),
        nuevoMetodos: z.array(
          z.object({
            nombre: z.string().describe("Nombre del método. Ejemplo: validarMensajeError"),
            codigo: z.string().describe("Código completo del método incluyendo su firma")
          })
        ).describe("Lista de métodos nuevos a agregar a la clase")
      },
    },
    async ({ nombreArchivo, nuevoMetodos }) => {
    const rutaCompleta = path.join(CYPRESS_BASE, "pageObjectModel", nombreArchivo);

    if (!fs.existsSync(rutaCompleta)) {
        return {
        content: [{ type: "text", text: `❌ No se encontró el archivo: ${rutaCompleta}` }],
        };
    }

    let contenido = fs.readFileSync(rutaCompleta, "utf-8").trim();

    const nombreClase = path.basename(nombreArchivo, ".js");
    const nombreElementos = nombreClase.replace("Funciones", "Elementos");

    const metodosNuevos = nuevoMetodos
        .map(({ codigo }) => `\n  ${codigo.trim()}\n`)
        .join("\n");

    // Si el archivo está vacío o no tiene la estructura → crearla completa
    if (!contenido.includes("export default")) {
        contenido = `import ${nombreElementos} from "./${nombreElementos}";\n\nclass ${nombreClase} {\n  constructor() {\n    this.selectors = ${nombreElementos};\n  }\n${metodosNuevos}\n}\n\nexport default ${nombreClase};\n`;
    } else {
        // Ya tiene estructura → insertar antes del cierre de la clase
        const indiceExport = contenido.lastIndexOf("export default");
        const indiceCierre = contenido.lastIndexOf("}", indiceExport - 1);
        contenido =
        contenido.substring(0, indiceCierre) +
        "\n" + metodosNuevos + "\n}" +
        contenido.substring(indiceCierre + 1);
    }

    fs.writeFileSync(rutaCompleta, contenido, "utf-8");

    const nombresAgregados = nuevoMetodos.map(m => m.nombre).join(", ");
    return {
        content: [{ type: "text", text: `✅ Métodos agregados a ${nombreArchivo}: ${nombresAgregados}` }],
    };
    }
  );

}