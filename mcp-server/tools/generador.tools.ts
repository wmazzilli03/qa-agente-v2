// Importamos el tipo McpServer para tipar el parámetro
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

// Esta función recibe el servidor y registra las tools del Agente02
export function registrarGeneradorTools(server: McpServer) {

  // ─────────────────────────────────────────────────────────────────────
  // Tool 1: Lee la Historia de Usuario desde un archivo .txt
  // ─────────────────────────────────────────────────────────────────────
  server.registerTool(
    "leer_historia_usuario",
    {
      title: "leer historia de usuario",
      description: "Lee el contenido de un archivo .txt que contiene una Historia de Usuario",
      inputSchema: {
        fileName: z.string().describe("Nombre del archivo .txt. Ejemplo: historia_usuario.txt")
      }
    },
    async ({ fileName }) => {
      // Buscamos el archivo en la carpeta /historias del proyecto
      const filePath = path.join(process.cwd(), "historias", fileName);

      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text", text: `Error: No se encontró el archivo ${fileName} en la carpeta /historias` }]
        };
      }

      const contenido = fs.readFileSync(filePath, "utf-8");
      return {
        content: [{ type: "text", text: contenido }]
      };
    }
  );

  // ─────────────────────────────────────────────────────────────────────
  // Tool 2: Guarda el borrador de Gherkin en /results para revisión
  // ─────────────────────────────────────────────────────────────────────
  server.registerTool(
    "guardar_borrador_gherkin",
    {
      title: "guardar borrador gherkin",
      description: "Guarda el Gherkin generado como borrador en /results para que el QA lo revise antes de enviarlo al proyecto",
      inputSchema: {
        fileName: z.string().describe("Nombre del archivo borrador. Ejemplo: login-borrador.txt"),
        content:  z.string().describe("Contenido del Gherkin generado")
      }
    },
    async ({ fileName, content }) => {
      const filePath = path.join(process.cwd(), "results", fileName);
      fs.writeFileSync(filePath, content, "utf-8");
      return {
        content: [{ type: "text", text: `✅ Borrador guardado en results/${fileName}\nRevísalo antes de confirmar.` }]
      };
    }
  );

  // ─────────────────────────────────────────────────────────────────────
  // Tool 3: Mueve el borrador aprobado al proyecto Cypress como .feature
  // ─────────────────────────────────────────────────────────────────────
  server.registerTool(
    "guardar_feature_en_cypress",
    {
      title: "guardar feature en cypress",
      description: "Copia el borrador aprobado al proyecto Cypress como archivo .feature",
      inputSchema: {
        borradorFileName: z.string().describe("Nombre del archivo borrador en /results. Ejemplo: login-borrador.txt"),
        featureFileName:  z.string().describe("Nombre del .feature destino. Ejemplo: login.feature"),
        sprint:           z.string().describe("Carpeta del sprint destino. Ejemplo: Sprint1")
      }
    },
    async ({ borradorFileName, featureFileName, sprint }) => {
      // Ruta del borrador aprobado
      const origen  = path.join(process.cwd(), "results", borradorFileName);

      // Ruta destino dentro del proyecto Cypress
      const destino = path.join(
        "D:/QA/Front/cypress_front",
        "cypress/e2e/features",
        sprint,
        featureFileName
      );

      if (!fs.existsSync(origen)) {
        return {
          content: [{ type: "text", text: `Error: No se encontró el borrador ${borradorFileName} en /results` }]
        };
      }

      // Creamos la carpeta del sprint si no existe
      fs.mkdirSync(path.dirname(destino), { recursive: true });

      // Copiamos el contenido al proyecto Cypress
      const contenido = fs.readFileSync(origen, "utf-8");
      fs.writeFileSync(destino, contenido, "utf-8");

      return {
        content: [{
          type: "text",
          text: `✅ Feature guardado en:\ncypress/e2e/features/${sprint}/${featureFileName}`
        }]
      };
    }
  );
}