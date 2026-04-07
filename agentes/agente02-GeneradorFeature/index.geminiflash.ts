// ═══════════════════════════════════════════════════════════════════
// AGENTE 02 — VERSIÓN GEMINI FLASH (via OpenRouter)
// Archivo: index.geminiflash.ts
//
// ¿QUÉ CAMBIÓ vs index.ts original?
//   1. La variable `anthropic` ahora apunta a OpenRouter (no a Anthropic)
//   2. El modelo cambió a "google/gemini-flash-1.5"
//   3. Se usa OPENROUTER_API_KEY en vez de ANTHROPIC_API_KEY
//   4. Se agregó baseURL para apuntar a OpenRouter
//   TODO LO DEMÁS ES IDÉNTICO AL ORIGINAL
// ═══════════════════════════════════════════════════════════════════

// ── CAMBIO 1 de 4 ───────────────────────────────────────────────────
// Seguimos importando el SDK de Anthropic — NO cambia
// OpenRouter habla el mismo "idioma" que Anthropic, por eso funciona
import Anthropic from "@anthropic-ai/sdk";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import path from "path";
import dotenv from "dotenv";
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// ARGUMENTOS DE TERMINAL — igual que el original
// ─────────────────────────────────────────────────────────────────────────────
const modo       = process.argv[2]; // "borrador" o "confirmar"
const argumento1 = process.argv[3];
const argumento2 = process.argv[4];
const argumento3 = process.argv[5];

if (!modo || !["borrador", "confirmar"].includes(modo)) {
  console.error("❌ Uso correcto:");
  console.error(`   npm run agente02gemini:borrador  ${argumento1}`);
  console.error(`   npm run agente02gemini:confirmar ${argumento1} sprintxxx nombre_feature`);
  process.exit(1);
}

if (!argumento1) {
  console.error("❌ Debes indicar el nombre del archivo.");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT DEL SISTEMA — igual que el original, no cambia nada aquí
// ─────────────────────────────────────────────────────────────────────────────
const PROMPT_SISTEMA = `
Eres un QA experto en Gherkin y Cucumber.
Tu tarea es leer una Historia de Usuario y generar escenarios de prueba
en formato Gherkin en español.

SIGUE EXACTAMENTE ESTE FORMATO:

Feature: [nombre de la funcionalidad]

  @tag_descriptivo
  Scenario: [nombre claro del escenario]
    Given [precondición o estado inicial]
    When [acción que realiza el usuario]
    Then [resultado esperado verificable]

REGLAS ESTRICTAS:
- Todo en español
- Cada criterio de aceptación o caso de prueba = 1 Scenario
- Cada Scenario debe tener su propio @tag en snake_case
- Usa Given / When / Then / And — pero máximo 2 And por Scenario
- No uses But
- Los datos de prueba van entre comillas dobles: "standard_user"
- La contraseña correcta de saucedemo es "secret_sauce"
- El feature debe ser ejecutable con Cypress + Cucumber
- No agregues comentarios ni explicaciones fuera del Gherkin
- Genera SOLO el contenido del archivo .feature, nada más
- Si es necesario crear escenarios Outline, úsalos "<ejemplo>" para los valores variables
- No crear escenarios de prueba de performance o de tiempos
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
async function main() {

  // ── CAMBIO 2 de 4 ───────────────────────────────────────────────────────────
  // Aquí está la MAGIA de OpenRouter
  //
  // ANTES (original):
  //   const anthropic = new Anthropic();
  //   → usaba ANTHROPIC_API_KEY automáticamente
  //   → apuntaba a api.anthropic.com automáticamente
  //
  // AHORA (OpenRouter):
  //   Misma clase Anthropic, PERO le decimos:
  //   - usa ESTA key (la de OpenRouter)
  //   - apunta a ESTA url (la de OpenRouter)
  //
  // Es como si le dijéramos: "habla igual, pero con otra empresa"
  // ────────────────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api",
  // ← Esta línea desactiva la validación interna del SDK
  defaultHeaders: {
    "HTTP-Referer": "https://qa-agente-v2",
    "X-Title": "QA Agente v2"
  }
});

  console.log("🔌 Conectando al servidor MCP...");

  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["mcp-server/index.ts"],
    cwd: process.cwd(),
    env: { ...process.env }
  });

  const clienteMCP = new Client(
    { name: "agente02-geminiflash", version: "1.0.0" },
    { capabilities: {} }
  );

  await clienteMCP.connect(transport);
  console.log("✅ Conectado al servidor MCP");

  const { tools } = await clienteMCP.listTools();

  const toolsParaClaude = tools.map(tool => ({
    name: tool.name,
    description: tool.description ?? "",
    input_schema: tool.inputSchema as {
      type: "object";
      properties?: Record<string, unknown>;
    }
  }));

  // ── MODO BORRADOR ──────────────────────────────────────────────────────────
  if (modo === "borrador") {

    console.log(`\n📖 Modo borrador — leyendo: ${argumento1}`);
    console.log(`🤖 Modelo: Gemini Flash (via OpenRouter)\n`);

    const nombreBorrador = argumento1.replace(".txt", "-borrador-gemini.txt");

    const mensajes: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Lee la historia de usuario del archivo "${argumento1}" 
y genera los escenarios Gherkin completos.
Luego guarda el resultado como borrador con el nombre "${nombreBorrador}".`
      }
    ];

    let continuar = true;

    while (continuar) {

      const respuesta = await anthropic.messages.create({
        // ── CAMBIO 3 de 4 ─────────────────────────────────────────────────────
        // Este es el nombre del modelo en OpenRouter
        // Formato siempre es: "proveedor/nombre-del-modelo"
        // Otros ejemplos:
        //   "openai/gpt-4o"
        //   "anthropic/claude-3-5-sonnet"
        //   "meta-llama/llama-3-70b-instruct"
        // ──────────────────────────────────────────────────────────────────────
        //model: "google/gemini-flash-1.5",
        model: "google/gemini-2.0-flash-lite-001",
        max_tokens: 4096,
        system: PROMPT_SISTEMA,
        tools: toolsParaClaude,
        messages: mensajes
      });

      mensajes.push({ role: "assistant", content: respuesta.content });

      if (respuesta.stop_reason === "tool_use") {

        const resultadosTools: Anthropic.ToolResultBlockParam[] = [];

        for (const bloque of respuesta.content) {
          if (bloque.type === "tool_use") {

            console.log(`🔧 Gemini usa tool: ${bloque.name}`);

            const resultado = await clienteMCP.callTool({
              name: bloque.name,
              arguments: bloque.input as Record<string, unknown>
            });

            resultadosTools.push({
              type: "tool_result",
              tool_use_id: bloque.id,
              content: resultado.content as string
            });
          }
        }

        mensajes.push({ role: "user", content: resultadosTools });

      } else {
        continuar = false;

        for (const bloque of respuesta.content) {
          if (bloque.type === "text") {
            console.log("\n📋 Gemini dice:\n");
            console.log(bloque.text);
          }
        }

        console.log(`\n✅ Borrador guardado como: results/${nombreBorrador}`);
        console.log(`👀 Revísalo y si está bien ejecuta:`);
        console.log(`   npm run agente02gemini:confirmar ${nombreBorrador} numero_sprint nombre_feature`);
      }
    }
  }

  // ── MODO CONFIRMAR ─────────────────────────────────────────────────────────
  if (modo === "confirmar") {

    if (!argumento2 || !argumento3) {
      console.error("❌ Para confirmar necesitas: npm run agente02gemini:confirmar [borrador] [Sprint] [feature]");
      process.exit(1);
    }

    console.log(`\n🚀 Modo confirmar — enviando a Cypress...`);
    console.log(`🤖 Modelo: Gemini Flash (via OpenRouter)\n`);
    console.log(`   Borrador : results/${argumento1}`);
    console.log(`   Destino  : cypress/e2e/features/${argumento2}/${argumento3}`);

    const mensajes: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Mueve el borrador aprobado al proyecto Cypress.
Borrador: "${argumento1}"
Sprint: "${argumento2}"
Nombre del feature: "${argumento3}"`
      }
    ];

    let continuar = true;

    while (continuar) {

      const respuesta = await anthropic.messages.create({
        // ── CAMBIO 4 de 4 ─────────────────────────────────────────────────────
        // Mismo modelo en modo confirmar
        // Si quisieras usar un modelo diferente para confirmar, lo cambias aquí
        // ──────────────────────────────────────────────────────────────────────
        model: "google/gemini-flash-1.5",
        max_tokens: 1024,
        system: PROMPT_SISTEMA,
        tools: toolsParaClaude,
        messages: mensajes
      });

      mensajes.push({ role: "assistant", content: respuesta.content });

      if (respuesta.stop_reason === "tool_use") {

        const resultadosTools: Anthropic.ToolResultBlockParam[] = [];

        for (const bloque of respuesta.content) {
          if (bloque.type === "tool_use") {

            console.log(`🔧 Gemini usa tool: ${bloque.name}`);

            const resultado = await clienteMCP.callTool({
              name: bloque.name,
              arguments: bloque.input as Record<string, unknown>
            });

            resultadosTools.push({
              type: "tool_result",
              tool_use_id: bloque.id,
              content: resultado.content as string
            });
          }
        }

        mensajes.push({ role: "user", content: resultadosTools });

      } else {
        continuar = false;

        for (const bloque of respuesta.content) {
          if (bloque.type === "text") {
            console.log("\n✅ Gemini dice:\n");
            console.log(bloque.text);
          }
        }

        console.log(`\n🎉 Feature listo en: cypress/e2e/features/${argumento2}/${argumento3}`);
      }
    }
  }

  await clienteMCP.close();
}

main().catch(console.error);
