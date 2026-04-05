// agentes/agente03-GeneradorSteps/index.ts

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import "dotenv/config"; // ← agrega esta línea



// ─────────────────────────────────────────────
// CONFIGURACIÓN — recibe parámetros desde terminal
// ─────────────────────────────────────────────

// process.argv[2] = primer argumento que pasas
// process.argv[3] = segundo argumento
// process.argv[4] = tercer argumento

const args = process.argv.slice(2); // slice(2) quita "node" y "index.ts"

if (args.length < 3) {
  console.error("❌ Uso: npm run agente03 -- <feature> <carpetaPO> <outputSteps>");
  console.error("   Ejemplo: npm run agente03 -- Sprint1/login.feature Login Sprint1/login.ts");
  process.exit(1); // detiene el proceso con error
}

const FEATURE_PATH  = args[0]; // "Sprint1/login.feature"
const CARPETA_PO    = args[1]; // "Login" o "Productos"
const STEPS_OUTPUT  = args[2]; // "Sprint1/login.ts"

// Con la carpeta construimos los nombres de Page Objects automáticamente
// Si carpeta = "Login"     → LoginElementos.js y LoginFunciones.js
// Si carpeta = "Productos" → ProductosElementos.js y ProductosFunciones.js
const PAGE_OBJ_ELEM = `${CARPETA_PO}/${CARPETA_PO}Elementos.js`;
const PAGE_OBJ_FUNC = `${CARPETA_PO}/${CARPETA_PO}Funciones.js`;

console.log(`📂 Feature:     ${FEATURE_PATH}`);
console.log(`📂 Page Object: ${PAGE_OBJ_ELEM}`);
console.log(`📂 Page Object: ${PAGE_OBJ_FUNC}`);
console.log(`📂 Output:      ${STEPS_OUTPUT}\n`);

const SYSTEM_PROMPT = `Eres un experto generador de Cypress step definitions.

FLUJO OBLIGATORIO — sigue este orden siempre:
1. Lee el .feature
2. Lee el archivo Elementos.js del Page Object indicado
3. Lee el archivo Funciones.js del Page Object indicado
4. Analiza qué métodos faltan en Funciones.js para cubrir TODOS los steps
5. Llama actualizar_page_object_funciones con los métodos que faltan
6. Lee Funciones.js de nuevo para confirmar los métodos actualizados
7. Genera el step definitions usando SOLO métodos del Page Object
8. Guarda el step con guardar_steps

CUANDO LOS PAGE OBJECTS NO EXISTEN:
- Si leer_page_object devuelve "creado con estructura vacía" → continúa el flujo normal
- Usa actualizar_page_object_elementos para agregar los XPath necesarios
- Usa actualizar_page_object_funciones para agregar los métodos necesarios
- NUNCA te detengas a preguntar — siempre continúa creando lo que falta

REGLAS PARA archivos Elementos.js:
- CRÍTICO: Los XPath SIEMPRE usan comillas simples afuera y comillas DOBLES adentro
- ✅ CORRECTO:   btnLogin: '//button[@id="login-button"]'
- ✅ CORRECTO:   inputUser: '//input[@id="user-name"]'
- ✅ CORRECTO contains: '//button[contains(text(), "Add to cart")]'
- ✅ CORRECTO contains class: '//a[contains(@class, "shopping_cart")]'
- ✅ CORRECTO text exacto: '//span[text()="Continue Shopping"]'
- ✅ CORRECTO con índice: '(//button[contains(text(), "Add to cart")])[1]'
- ❌ INCORRECTO: '//button[contains(text(), 'Add to cart')]'
- ❌ INCORRECTO: '//span[@class='shopping_cart_badge']'
- REGLA DE ORO: todo lo que va entre comillas DENTRO del XPath → siempre comillas DOBLES

REGLAS PARA archivos Funciones.js:
- Es un archivo .js NO .ts — PROHIBIDO usar tipos TypeScript
- Incorrecto: ingresarCredenciales(usuario: string, password: string)
- Correcto:   ingresarCredenciales(usuario, password)
- Los métodos usan this.selectors para acceder a los XPath

REGLAS ESTRICTAS DEL STEP GENERADO:
- Import: import { Given, When, Then } from "@badeball/cypress-cucumber-preprocessor"
- NUNCA importes And — no existe. Usa Given, When o Then según contexto
- Import Page Object SIEMPRE así:
  import [NombreClase]Funciones from "../../pageObjectModel/[Carpeta]/[NombreClase]Funciones"
- Ejemplo: import CarritoFunciones from "../../pageObjectModel/Carrito/CarritoFunciones"
- La carpeta del import es exactamente la misma carpeta que se pasó como parámetro al agente
- NUNCA uses rutas como support/, commands/, o cualquier otra ruta inventada
- PROHIBIDO TOTALMENTE usar cy. directamente en el step
- PROHIBIDO: cy.xpath(), cy.url(), cy.visit(), cy.clearCookies(), cy.clearLocalStorage()
- Si necesitas cy. → primero crea el método en Funciones.js
- Todo cy. va dentro de Funciones.js, nunca en el step
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