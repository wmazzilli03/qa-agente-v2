// Importamos Anthropic para hablar con Claude
import Anthropic from "@anthropic-ai/sdk";
// Importamos las herramientas para conectarnos al servidor MCP
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// Importamos dotenv para leer el .env
import dotenv from "dotenv";
// Activamos dotenv — a partir de aquí puede leer el .env
dotenv.config();


// Función principal del agente
async function main() {

  // Creamos el "cable" que conecta el agente con el servidor MCP
  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["mcp-server/index.ts"]
  });

  // Creamos el cliente MCP
  const client = new Client({
    name: "agente01-leeAnaliza",
    version: "1.0.0"
  });

  // Conectamos el cliente al servidor
  await client.connect(transport);
  console.log("Agente conectado al servidor MCP ✅");

  // Creamos el cliente de Anthropic con la API key del .env
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  // Obtenemos la lista de tools disponibles en el servidor MCP
  const toolsDisponibles = await client.listTools();

  // Convertimos las tools al formato que Claude entiende
  const tools = toolsDisponibles.tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }));

  // Historial de mensajes — lo vamos construyendo con cada tool
  const mensajes: Anthropic.MessageParam[] = [{
    role: "user",
    content: `Eres un analista de QA experto.
    Sigue estos pasos en orden:
    1. Usa la tool "ejecutar_cypress" con spec "cypress/e2e/features/Sprint2/comprarProducto.feature"
    2. Cuando termine, usa "leer_resultado_del_test" con el archivo "test-resultado.json"
    3. Dame un análisis detallado: qué falló, posibles causas y recomendaciones.`
  }];

  // Primera llamada a Claude
  let respuesta = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    tools: tools,
    messages: mensajes
  });

  console.log("✅ Primera respuesta de Claude recibida");

  // Seguimos ejecutando tools mientras Claude las siga pidiendo
  // stop_reason "tool_use" significa que Claude quiere usar una tool
  // stop_reason "end_turn" significa que Claude ya terminó
  while (respuesta.stop_reason === "tool_use") {

    // Agregamos la respuesta de Claude al historial
    mensajes.push({
      role: "assistant",
      content: respuesta.content
    });

    // Recolectamos los resultados de todas las tools que Claude pidió
    const resultadosTools: Anthropic.ToolResultBlockParam[] = [];

    for (const bloque of respuesta.content) {
      if (bloque.type === "tool_use") {

        console.log(`🔧 Ejecutando tool: ${bloque.name}`);

        // Ejecutamos la tool en el servidor MCP
        const resultadoTool = await client.callTool({
          name: bloque.name,
          arguments: bloque.input as Record<string, unknown>
        });

        // Guardamos el resultado para mandárselo a Claude
        resultadosTools.push({
          type: "tool_result",
          tool_use_id: bloque.id,
          content: JSON.stringify(resultadoTool.content)
        });
      }
    }

    // Agregamos todos los resultados al historial
    mensajes.push({
      role: "user",
      content: resultadosTools
    });

    // Le mandamos el historial completo a Claude para que continúe
    respuesta = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      tools: tools,
      messages: mensajes
    });
  }

  // Cuando Claude ya no pide más tools — extraemos el análisis final
  const textoAnalisis = respuesta.content
    .filter(b => b.type === "text")
    .map(b => b.type === "text" ? b.text : "")
    .join("\n");

  console.log("\n📊 ANÁLISIS FINAL:\n", textoAnalisis);

  // Guardamos el análisis en /results
  const nombreArchivo = `analysis-agente01-${Date.now()}.json`;
  await client.callTool({
    name: "guardar_reporte",
    arguments: {
      fileName: nombreArchivo,
      contenido: JSON.stringify({ analisis: textoAnalisis }, null, 2)
    }
  });

  console.log(`\n✅ Reporte guardado: ${nombreArchivo}`);

  // Cerramos la conexión con el servidor MCP
  await client.close();
  console.log("Agente finalizado 👋");

}

// Ejecutamos la función principal
main();