/**
 * Tests Unitarios de Verificación para QualityDev
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Ejecutando suite de pruebas unitarias para QualityDev...');

// Test 1: Verificar existencia de archivos del sistema QualityDev
const skillPath = path.join(__dirname, '.agents', 'skills', 'quality-driven-dev', 'SKILL.md');
assert.strictEqual(fs.existsSync(skillPath), true, 'Falta el archivo SKILL.md de la habilidad');

const jsRunnerPath = path.join(__dirname, 'quality_dev.js');
assert.strictEqual(fs.existsSync(jsRunnerPath), true, 'Falta el ejecutable quality_dev.js');

const pyRunnerPath = path.join(__dirname, 'quality_dev.py');
assert.strictEqual(fs.existsSync(pyRunnerPath), true, 'Falta el ejecutable quality_dev.py');

const readmePath = path.join(__dirname, 'README.md');
assert.strictEqual(fs.existsSync(readmePath), true, 'Falta el archivo README.md');

const gitignorePath = path.join(__dirname, '.gitignore');
assert.strictEqual(fs.existsSync(gitignorePath), true, 'Falta el archivo .gitignore');

const logPath = path.join(__dirname, 'QUALITY_LOG.md');
assert.strictEqual(fs.existsSync(logPath), true, 'Falta el archivo QUALITY_LOG.md');

// Test 2: Verificar sintaxis de quality_dev.js
try {
    require('./quality_dev.js');
    console.log('  ✓ quality_dev.js cargado correctamente.');
} catch (e) {
    assert.fail(`Error al importar quality_dev.js: ${e.message}`);
}

console.log('✅ Todas las pruebas de QualityDev pasaron exitosamente.');
