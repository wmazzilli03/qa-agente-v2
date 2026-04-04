// Importamos el servidor MCP y el transporte por terminal
import { McpServer }          from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Importamos las funciones que registran cada grupo de tools
import { registrarCypressTools }   from "./tools/cypress.tools.js";
import { registrarReportesTools }  from "./tools/reportes.tools.js";
import { registrarGeneradorTools } from "./tools/generador.tools.js";

// Creamos el servidor MCP con nombre y versión
const server = new McpServer({
  name: "qa-agente-v2-server",
  version: "1.0.0"
});

// Registramos todas las tools agrupadas por responsabilidad
registrarCypressTools(server);   // ejecutar_cypress, leer_resultado_del_test
registrarReportesTools(server);  // listar_reportes, guardar_reporte
registrarGeneradorTools(server); // leer_historia_usuario, guardar_borrador_gherkin, guardar_feature_en_cypress


// Función principal que arranca el servidor
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ Servidor MCP arrancado — tools registradas");
}

main();