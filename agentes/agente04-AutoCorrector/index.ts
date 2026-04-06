// agentes/agente04-AutoCorrector/index.ts

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import dotenv from "dotenv";
dotenv.config();

// ─────────────────────────────────────────────
// CONFIGURACIÓN — recibe parámetros desde terminal
// ─────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length < 3) {
  console.error("❌ Uso: npm run agente04 -- <feature> <carpetaPO> <stepsFile>");
  console.error("   Ejemplo: npm run agente04 -- Sprint3/carrito.feature CarritoCompra Sprint3/carrito.ts");
  process.exit(1);
}

const FEATURE_PATH = args[0]; // "Sprint3/carrito.feature"
const CARPETA_PO   = args[1]; // "CarritoCompra"
const STEPS_FILE   = args[2]; // "Sprint3/carrito.ts"

const MAX_INTENTOS = 3; // máximo de ciclos ejecutar→corregir

console.log(`📂 Feature:     ${FEATURE_PATH}`);
console.log(`📂 Page Object: ${CARPETA_PO}`);
console.log(`📂 Steps:       ${STEPS_FILE}`);

// ─────────────────────────────────────────────
// PROMPT DEL SISTEMA
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres un experto en corregir tests de Cypress que fallan.

FLUJO OBLIGATORIO — sigue este orden siempre:
1. Ejecuta Cypress con ejecutar_cypress
2. Lee el resultado con leer_resultado_del_test
3. Analiza cada error del resultado
4. Corrige según el tipo de error
5. Vuelve al paso 1
6. Si todos los tests pasan → termina con mensaje de éxito

TIPOS DE ERROR Y CÓMO CORREGIRLOS:

TIPO 1 — XPath con comillas mal puestas:
  Síntoma: '//button[@id='algo']' o '//div[@class='algo']'
  Causa: comillas simples adentro del XPath
  Solución: cambiar comillas internas a dobles
  ✅ Correcto: '//button[@id="algo"]'
  Acción: usa actualizar_page_object_elementos

TIPO 2 — Elemento no encontrado en página:
  Síntoma: "Expected to find element... but never found it"
  Solución A: cambiar @id exacto por contains(@id)
    '//button[@id="add-to-cart"]' → '//button[contains(@id,"add-to-cart")]'
  Solución B: cambiar a búsqueda por texto visible
    '//button[@id="add-to-cart"]' → '//button[text()="Add to cart"]'
  Solución C: usar contains con texto
    '//button[text()="Add to cart"]' → '//button[contains(text(),"Add to cart")]'
  Acción: usa actualizar_page_object_elementos

TIPO 3 — Método no existe en Page Object:
  Síntoma: "is not a function" o "loginFunciones.X is not a function"
  Solución: crear el método que falta
  Acción: usa actualizar_page_object_funciones

TIPO 4 — Step no definido:
  Síntoma: "Step implementation missing" o "Undefined"
  Solución: agregar el step que falta
  Acción: usa guardar_steps con el step completo actualizado

REGLAS IMPORTANTES:
- Antes de corregir → lee el archivo con leer_page_object para ver el estado actual
- Solo modifica lo que está fallando — no toques lo que ya pasa
- Si un error persiste después de 2 correcciones → reporta que no pudiste resolverlo
- Los XPath SIEMPRE usan comillas simples afuera y comillas DOBLES adentro
- ✅ '//button[contains(text(), "Add to cart")]'
- ✅ '//a[contains(@class, "shopping_cart")]'
- ✅ '//span[text()="Continue Shopping"]'
- ❌ '//button[contains(text(), 'Add to cart')]'`;

// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────
async function ejecutarAgente04() {
  console.log("\n🤖 Agente04 AutoCorrector iniciando...");

  // 1. Conectar al servidor MCP
  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["mcp-server/index.ts"],
    cwd: process.cwd(),
    env: { ...process.env },
  });

  const mcpClient = new Client({ name: "agente04", version: "1.0.0" });
  await mcpClient.connect(transport);
  console.log("✅ Conectado al servidor MCP");

  // 2. Conectar cliente Anthropic
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // 3. Obtener tools disponibles
  const { tools: mcpTools } = await mcpClient.listTools();
  const tools = mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));

  // ─────────────────────────────────────────────
  // 4. BUCLE AGÉNTICO
  // ─────────────────────────────────────────────
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Ejecuta y corrige los tests de Cypress.
      
Feature:     ${FEATURE_PATH}
Page Object: ${CARPETA_PO}
Steps:       ${STEPS_FILE}
Intentos máximos de corrección: ${MAX_INTENTOS}

Sigue el flujo obligatorio. Si todos los tests pasan en cualquier intento, termina con éxito.`,
    },
  ];

  console.log("🔄 Iniciando bucle agéntico...\n");

  while (true) {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    console.log(`📊 Stop reason: ${response.stop_reason}`);

    // Claude terminó
    if (response.stop_reason === "end_turn") {
      console.log("\n✅ Agente04 terminó.");
      for (const block of response.content) {
        if (block.type === "text") {
          console.log("\n📝 Resultado final:\n", block.text);
        }
      }
      break;
    }

    // Claude quiere usar una tool
    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`🔧 Tool llamada: ${block.name}`);
          console.log(`   Params: ${JSON.stringify(block.input)}`);

          const resultado = await mcpClient.callTool({
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });

          const textoResultado = (
            resultado.content as Array<{ type: string; text: string }>
          )
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");

          console.log(`   ✅ Resultado: ${textoResultado.substring(0, 100)}...`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: textoResultado,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  // 5. Cerrar conexión
  await mcpClient.close();
  console.log("\n🏁 Agente04 finalizado.");
}

// Ejecutar
ejecutarAgente04().catch(console.error);