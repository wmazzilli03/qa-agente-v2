// convertir-cypress.mjs
// Traduce el JSON de Mochawesome al formato que entiende Agente01

import fs from "fs";
import path from "path";

// ── RUTAS ──────────────────────────────────────────────────────────────────
// Donde Mochawesome guarda su JSON (proyecto Cypress)
const ORIGEN = "D:/QA/Front/cypress_front/cypress/results/mochawesome.json";

// Donde Agente01 espera encontrar el resultado (proyecto qa-agente-v2)
const DESTINO = "./results/test-resultado.json";

// ── LEER EL JSON DE MOCHAWESOME ────────────────────────────────────────────
const raw = fs.readFileSync(ORIGEN, "utf-8");
const mochawesome = JSON.parse(raw);

// ── EXTRAER LOS TESTS (están 3 niveles adentro) ───────────────────────────
// Mochawesome: results[] → suites[] → suites[] → tests[]
const testsExtraidos = [];

for (const resultado of mochawesome.results) {
  for (const suite of resultado.suites) {
    for (const test of suite.tests) {

        // Solo guardamos lo que Agente01 necesita
        testsExtraidos.push({
          name: test.fullTitle,         // nombre completo del test
          status: test.state,           // "passed" o "failed"
          duration: test.duration,      // milisegundos
          error: test.err?.message      // mensaje de error (si falló)
                 ?? null                // null si no hubo error
        });

      }
    }
  }


// ── CONSTRUIR EL FORMATO QUE ENTIENDE AGENTE01 ────────────────────────────
const formatoAgente01 = {
  total:    mochawesome.stats.tests,
  passed:   mochawesome.stats.passes,
  failed:   mochawesome.stats.failures,
  duration: mochawesome.stats.duration,
  tests:    testsExtraidos
};

// ── GUARDAR EN /results ────────────────────────────────────────────────────
fs.writeFileSync(DESTINO, JSON.stringify(formatoAgente01, null, 2), "utf-8");

console.log("✅ Conversión exitosa!");
console.log(`   Tests encontrados: ${testsExtraidos.length}`);
console.log(`   Pasaron: ${formatoAgente01.passed}`);
console.log(`   Fallaron: ${formatoAgente01.failed}`);
console.log(`   Guardado en: ${DESTINO}`);