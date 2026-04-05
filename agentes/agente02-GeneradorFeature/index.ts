// Importamos Anthropic para hablar con Claude
import Anthropic from "@anthropic-ai/sdk";



// Importamos el cliente MCP y el transporte por terminal
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import path from "path";
import dotenv from "dotenv";
dotenv.config();



// ─────────────────────────────────────────────────────────────────────────────
// LEEMOS LOS ARGUMENTOS DE LA TERMINAL
// Ejemplo: npm run agente02:borrador historia_usuario.txt
//          process.argv = ["node", "index.ts", "borrador", "historia_usuario.txt"]
// ─────────────────────────────────────────────────────────────────────────────
const modo         = process.argv[2]; // "borrador" o "confirmar"
const argumento1   = process.argv[3]; // nombre del archivo HU o borrador
const argumento2   = process.argv[4]; // sprint (solo en modo confirmar)
const argumento3   = process.argv[5]; // nombre del .feature (solo en modo confirmar)

// Validamos que se pasó el modo correcto
if (!modo || !["borrador", "confirmar"].includes(modo)) {
  console.error("❌ Uso correcto:");
  console.error("   npm run agente02:borrador  historia_usuario.txt");
  console.error("   npm run agente02:confirmar login-borrador.txt Sprint1 login.feature");
  process.exit(1);
}

// Validamos que se pasó el archivo
if (!argumento1) {
  console.error("❌ Debes indicar el nombre del archivo.");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT DEL SISTEMA — Le dice a Claude cómo debe comportarse
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

  // Iniciamos el cliente Anthropic
  const anthropic = new Anthropic();

  // ── Conectamos al servidor MCP ─────────────────────────────────────────────
  console.log("🔌 Conectando al servidor MCP...");


    // ✅ Así debe quedar — igual que el Agente01
    const transport = new StdioClientTransport({
        command: "tsx",
        args: ["mcp-server/index.ts"],
        cwd: process.cwd(),
        env: { ...process.env }
    });

  const clienteMCP = new Client(
    { name: "agente02-generador", version: "1.0.0" },
    { capabilities: {} }
  );

  await clienteMCP.connect(transport);
  console.log("✅ Conectado al servidor MCP");

  // Obtenemos la lista de tools disponibles
  const { tools } = await clienteMCP.listTools();

  // Convertimos las tools al formato que entiende Claude
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

    // Generamos el nombre del archivo borrador automáticamente
    // Ejemplo: historia_usuario.txt → historia_usuario-borrador.txt
    const nombreBorrador = argumento1.replace(".txt", "-borrador.txt");

    // Mensaje inicial para Claude
    const mensajes: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Lee la historia de usuario del archivo "${argumento1}" 
y genera los escenarios Gherkin completos.
Luego guarda el resultado como borrador con el nombre "${nombreBorrador}".`
      }
    ];

    // ── Bucle de herramientas — Claude ejecuta tools hasta terminar ───────────
    let continuar = true;

    while (continuar) {
      // Le preguntamos a Claude qué hacer
      const respuesta = await anthropic.messages.create({
       model: "claude-haiku-4-5-20251001",
        //model:"gemini-1.5-flash",
        max_tokens: 4096,
        system: PROMPT_SISTEMA,
        tools: toolsParaClaude,
        messages: mensajes
      });

      // Agregamos la respuesta de Claude al historial
      mensajes.push({ role: "assistant", content: respuesta.content });

      // ── Si Claude quiere usar una tool ──────────────────────────────────────
      if (respuesta.stop_reason === "tool_use") {

        const resultadosTools: Anthropic.ToolResultBlockParam[] = [];

        // Ejecutamos cada tool que Claude pidió
        for (const bloque of respuesta.content) {
          if (bloque.type === "tool_use") {

            console.log(`🔧 Claude usa tool: ${bloque.name}`);

            // Ejecutamos la tool en el servidor MCP
            const resultado = await clienteMCP.callTool({
              name: bloque.name,
              arguments: bloque.input as Record<string, unknown>
            });

            // Guardamos el resultado para enviárselo a Claude
            resultadosTools.push({
              type: "tool_result",
              tool_use_id: bloque.id,
              content: resultado.content as string
            });
          }
        }

        // Le enviamos los resultados de las tools a Claude
        mensajes.push({ role: "user", content: resultadosTools });

      } else {
        // Claude terminó — stop_reason es "end_turn"
        continuar = false;

        // Mostramos el mensaje final de Claude
        for (const bloque of respuesta.content) {
          if (bloque.type === "text") {
            console.log("\n📋 Claude dice:\n");
            console.log(bloque.text);
          }
        }

        console.log(`\n✅ Borrador guardado como: results/${nombreBorrador}`);
        console.log(`👀 Revísalo y si está bien ejecuta:`);
        console.log(`   npm run agente02:confirmar ${nombreBorrador} Sprint1 login.feature`);
      }
    }
  }

  // ── MODO CONFIRMAR ─────────────────────────────────────────────────────────
  if (modo === "confirmar") {

    // Validamos que se pasaron todos los argumentos necesarios
    if (!argumento2 || !argumento3) {
      console.error("❌ Para confirmar necesitas: npm run agente02:confirmar [borrador] [Sprint] [feature]");
      console.error("   Ejemplo: npm run agente02:confirmar login-borrador.txt Sprint1 login.feature");
      process.exit(1);
    }

    console.log(`\n🚀 Modo confirmar — enviando a Cypress...`);
    console.log(`   Borrador : results/${argumento1}`);
    console.log(`   Destino  : cypress/e2e/features/${argumento2}/${argumento3}`);

    // Mensaje para Claude — solo necesita ejecutar una tool
    const mensajes: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Mueve el borrador aprobado al proyecto Cypress.
Borrador: "${argumento1}"
Sprint: "${argumento2}"
Nombre del feature: "${argumento3}"`
      }
    ];

    // Bucle igual que en modo borrador
    let continuar = true;

    while (continuar) {

      const respuesta = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
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

            console.log(`🔧 Claude usa tool: ${bloque.name}`);

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
            console.log("\n✅ Claude dice:\n");
            console.log(bloque.text);
          }
        }

        console.log(`\n🎉 Feature listo en: cypress/e2e/features/${argumento2}/${argumento3}`);
      }
    }
  }

  // Cerramos la conexión MCP
  await clienteMCP.close();
}

// Ejecutamos
main().catch(console.error);
