// agentes/agente03-GeneradorSteps/index.ts

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import "dotenv/config"; // ← agrega esta línea

// ─────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────
const FEATURE_PATH    = "Sprint1/login.feature";
const PAGE_OBJ_ELEM   = "Login/LoginElementos.js";
const PAGE_OBJ_FUNC   = "Login/LoginFunciones.js";
const STEPS_OUTPUT    = "Sprint1/login.ts";

// ─────────────────────────────────────────────
// PROMPT DEL SISTEMA — controla la calidad del output
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres un experto generador de Cypress step definitions.

FLUJO OBLIGATORIO — sigue este orden siempre:
1. Lee el .feature
2. Lee LoginElementos.js
3. Lee LoginFunciones.js
4. Analiza qué métodos faltan en LoginFunciones.js para cubrir TODOS los steps
5. Llama actualizar_page_object_funciones con los métodos que faltan
6. Lee LoginFunciones.js de nuevo para confirmar los métodos actualizados
7. Genera el step definitions usando SOLO métodos del Page Object
8. Guarda el step con guardar_steps

REGLAS PARA LoginElementos.js:
- Los XPath usan comillas simples afuera y comillas DOBLES adentro
- Correcto: '//input[@id="user-name"]'
- Incorrecto: '//input[@id='user-name']'

REGLAS PARA LoginFunciones.js:
- Es un archivo .js NO .ts — PROHIBIDO usar tipos TypeScript
- Incorrecto: ingresarCredenciales(usuario: string, password: string)
- Correcto:   ingresarCredenciales(usuario, password)
- Los métodos usan this.selectors para acceder a los XPath

REGLAS ESTRICTAS DEL STEP GENERADO:
- Import: import { Given, When, Then } from "@badeball/cypress-cucumber-preprocessor"
- NUNCA importes And — no existe. Usa Given, When o Then según contexto
- Import Page Object: import LoginFunciones from "../../pageObjectModel/Login/LoginFunciones"
- Instancia: const loginFunciones = new LoginFunciones()
- PROHIBIDO TOTALMENTE usar cy. directamente en el step
- PROHIBIDO: cy.xpath(), cy.url(), cy.visit(), cy.clearCookies(), cy.clearLocalStorage()
- Si necesitas cy. → primero crea el método en LoginFunciones.js
- Todo cy. va dentro de LoginFunciones.js, nunca en el step
- Los parámetros {string} del Gherkin se reciben como (param: string) en TypeScript
- Genera TODOS los steps sin omitir ninguno
- Solo código TypeScript puro sin markdown ni comentarios`;

// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────
async function ejecutarAgente03() {
  console.log("🤖 Agente03 iniciando...");

  // 1. Conectar al servidor MCP
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "mcp-server/index.ts"],
    env: { ...process.env, PATH: process.env.PATH || "" },
  });

  const mcpClient = new Client({ name: "agente03", version: "1.0.0" });
  await mcpClient.connect(transport);
  console.log("✅ Conectado al servidor MCP");

  // 2. Conectar cliente de Anthropic
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // 3. Obtener lista de tools disponibles
  const { tools: mcpTools } = await mcpClient.listTools();
  const tools = mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));

  // ─────────────────────────────────────────────
  // 4. BUCLE AGENTICO
  // ─────────────────────────────────────────────
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Genera el archivo de step definitions para Cypress siguiendo estos pasos en orden:

1. Lee el feature: ${FEATURE_PATH}
2. Lee el Page Object de elementos: ${PAGE_OBJ_ELEM}
3. Lee el Page Object de funciones: ${PAGE_OBJ_FUNC}
4. Genera el archivo TypeScript completo con TODOS los steps del feature
5. Guarda el resultado en: ${STEPS_OUTPUT}

Usa los métodos reales del Page Object. No inventes nada.`,
    },
  ];

  console.log("🔄 Iniciando bucle agéntico...\n");

  // El bucle corre mientras Claude siga llamando tools
  while (true) {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    console.log(`📊 Stop reason: ${response.stop_reason}`);

    // Si Claude terminó de pensar → salimos del bucle
    if (response.stop_reason === "end_turn") {
      console.log("\n✅ Agente03 terminó.");
      // Mostrar el texto final si lo hay
      for (const block of response.content) {
        if (block.type === "text") {
          console.log("\n📝 Respuesta final:\n", block.text);
        }
      }
      break;
    }

    // Si Claude quiere usar una tool → ejecutarla
    if (response.stop_reason === "tool_use") {
      // Agregar respuesta de Claude al historial
      messages.push({ role: "assistant", content: response.content });

      // Procesar cada tool que Claude pidió
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`🔧 Tool llamada: ${block.name}`);
          console.log(`   Params: ${JSON.stringify(block.input)}`);

          // Ejecutar la tool en el servidor MCP
          const resultado = await mcpClient.callTool({
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });

          // Extraer el texto del resultado
          const textoResultado = (resultado.content as Array<{ type: string; text: string }>)
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");

          console.log(`   ✅ Resultado: ${textoResultado.substring(0, 80)}...`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: textoResultado,
          });
        }
      }

      // Agregar resultados al historial para la siguiente iteración
      messages.push({ role: "user", content: toolResults });
    }
  }

  // 5. Cerrar conexión MCP
  await mcpClient.close();
  console.log("\n🏁 Agente03 finalizado.");
}

// Ejecutar
ejecutarAgente03().catch(console.error);