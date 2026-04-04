// Importamos el tipo McpServer para tipar el parámetro
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

// Esta función recibe el servidor y registra las tools de Cypress
export function registrarCypressTools(server: McpServer) {

  // Tool: Lee el contenido de un archivo JSON de resultados
  server.registerTool(
    "leer_resultado_del_test",
    {
      title: "leer resultado del test",
      description: "Lee el contenido de un archivo JSON de resultados de Cypress",
      inputSchema: {
        fileName: z.string().describe("Nombre del archivo JSON a leer")
      }
    },
    async ({ fileName }) => {
      const filePath = path.join(process.cwd(), "results", fileName);

      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text", text: `Error: El archivo ${fileName} no existe` }]
        };
      }

      const contenido = fs.readFileSync(filePath, "utf-8");
      return {
        content: [{ type: "text", text: contenido }]
      };
    }
  );

  // Tool: Ejecuta Cypress y convierte el resultado al formato del agente
  server.registerTool(
    "ejecutar_cypress",
    {
      title: "ejecutar cypress",
      description: "Ejecuta las pruebas de Cypress y convierte el resultado al formato del agente",
      inputSchema: {
        spec: z.string().describe("Ruta del archivo .feature a ejecutar. Ejemplo: cypress/e2e/features/Sprint1/login.feature")
      }
    },
    async ({ spec }) => {

      const { execSync } = await import("child_process");

      // ── PASO 1: Correr Cypress ──────────────────────────────────────
      try {
        console.error(`Ejecutando Cypress con spec: ${spec}`);
        execSync(
          `npx cypress run --e2e --spec "${spec}"`,
          {
            cwd: "D:/QA/Front/cypress_front",
            stdio: "pipe"
          }
        );
        console.error("Cypress terminó correctamente ✅");
      } catch (error) {
        // Cypress lanza error si hay tests fallidos — es normal, continuamos
        console.error("Cypress terminó con fallos (normal, continuamos)");
      }

      // ── PASO 2: Convertir mochawesome → formato del agente ──────────
      const ORIGEN  = "D:/QA/Front/cypress_front/cypress/results/mochawesome.json";
      const DESTINO = path.join(process.cwd(), "results", "test-resultado.json");

      if (!fs.existsSync(ORIGEN)) {
        return {
          content: [{ type: "text", text: "Error: Cypress no generó el archivo mochawesome.json" }]
        };
      }

      const raw         = fs.readFileSync(ORIGEN, "utf-8");
      const mochawesome = JSON.parse(raw);

      const testsExtraidos: Array<{
        name: string;
        status: string;
        duration: number;
        error: string | null;
      }> = [];

      for (const resultado of mochawesome.results) {
        for (const suite of resultado.suites) {
          for (const test of suite.tests) {
            testsExtraidos.push({
              name:     test.title,
              status:   test.state,
              duration: test.duration,
              error:    test.err?.message ?? null
            });
          }
        }
      }

      const formatoFinal = {
        total:    mochawesome.stats.tests,
        passed:   mochawesome.stats.passes,
        failed:   mochawesome.stats.failures,
        duration: mochawesome.stats.duration,
        tests:    testsExtraidos
      };

      fs.writeFileSync(DESTINO, JSON.stringify(formatoFinal, null, 2), "utf-8");

      return {
        content: [{
          type: "text",
          text: `✅ Cypress ejecutado y resultado convertido.\nTests: ${formatoFinal.total} | Pasaron: ${formatoFinal.passed} | Fallaron: ${formatoFinal.failed}`
        }]
      };
    }
  );
}