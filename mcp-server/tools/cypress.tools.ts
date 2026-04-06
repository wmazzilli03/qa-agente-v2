import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

export function registrarCypressTools(server: McpServer) {

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
      const CARPETA_RESULTS = "D:/QA/Front/cypress_front/cypress/results";
      const DESTINO = path.join(process.cwd(), "results", "test-resultado.json");

      // ── PASO 1: Borrar reportes anteriores ─────────────────────────
      // Así garantizamos que siempre leemos el reporte de ESTA ejecución
      if (fs.existsSync(CARPETA_RESULTS)) {
        const reportesViejos = fs.readdirSync(CARPETA_RESULTS)
          .filter(f => f.startsWith("mochawesome") && f.endsWith(".json"));

        for (const reporte of reportesViejos) {
          fs.unlinkSync(path.join(CARPETA_RESULTS, reporte));
        }
        console.error(`🗑️  Borrados ${reportesViejos.length} reportes anteriores`);
      }

      // ── PASO 2: Correr Cypress ──────────────────────────────────────
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
        console.error("Cypress terminó con fallos (normal, continuamos)");
      }

      // ── PASO 3: Leer el reporte recién generado ─────────────────────
      const archivos = fs.readdirSync(CARPETA_RESULTS)
        .filter(f => f.startsWith("mochawesome") && f.endsWith(".json"))
        .filter(f => f !== "mochawesome.json");

      if (archivos.length === 0) {
        return {
          content: [{ type: "text", text: "Error: Cypress no generó ningún reporte mochawesome" }]
        };
      }

      // El más reciente — ahora siempre será el de esta ejecución
      const masReciente = archivos
        .map(f => ({
          nombre: f,
          fecha: fs.statSync(path.join(CARPETA_RESULTS, f)).mtime
        }))
        .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())[0];

      console.error(`📄 Leyendo reporte: ${masReciente.nombre}`);

      const ORIGEN = path.join(CARPETA_RESULTS, masReciente.nombre);
      const raw    = fs.readFileSync(ORIGEN, "utf-8");
      const mochawesome = JSON.parse(raw);

      // ── PASO 4: Convertir al formato del agente ─────────────────────
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
              error:    test.err ? test.err.message : null
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