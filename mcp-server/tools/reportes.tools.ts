// Importamos el tipo McpServer para tipar el parámetro
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

// Esta función recibe el servidor y registra las tools de reportes
export function registrarReportesTools(server: McpServer) {

  // Tool: Lista todos los reportes guardados en /results
  server.registerTool(
    "listar_reportes",
    {
      title: "listar reportes",
      description: "Lista todos los reportes guardados en la carpeta results",
      inputSchema: {}
    },
    async () => {
      const resultsPath = path.join(process.cwd(), "results");
      const archivos = fs.readdirSync(resultsPath);
      return {
        content: [{
          type: "text",
          text: archivos.join("\n")
        }]
      };
    }
  );

  // Tool: Guarda un reporte en la carpeta /results
  server.registerTool(
    "guardar_reporte",
    {
      title: "guardar reporte",
      description: "Guarda un reporte en la carpeta results",
      inputSchema: {
        fileName: z.string().describe("Nombre del archivo a guardar"),
        content:  z.string().describe("Contenido del reporte a guardar")
      }
    },
    async ({ fileName, content }) => {
      const filePath = path.join(process.cwd(), "results", fileName);
      fs.writeFileSync(filePath, content);
      return {
        content: [{ type: "text", text: `Reporte guardado: ${fileName}` }]
      };
    }
  );
}