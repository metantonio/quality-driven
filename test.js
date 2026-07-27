/**
 * Unit Verification Tests for QualexDev
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running unit verification test suite for QualexDev...');

// Test 1: Verify presence of QualexDev core system files
const skillPath = path.join(__dirname, '.agents', 'skills', 'quality-driven-dev', 'SKILL.md');
assert.strictEqual(fs.existsSync(skillPath), true, 'Missing SKILL.md agent definition file');

const jsRunnerPath = path.join(__dirname, 'quality_dev.js');
assert.strictEqual(fs.existsSync(jsRunnerPath), true, 'Missing quality_dev.js executable');

const pyRunnerPath = path.join(__dirname, 'quality_dev.py');
assert.strictEqual(fs.existsSync(pyRunnerPath), true, 'Missing quality_dev.py executable');

const readmePath = path.join(__dirname, 'README.md');
assert.strictEqual(fs.existsSync(readmePath), true, 'Missing README.md');

const gitignorePath = path.join(__dirname, '.gitignore');
assert.strictEqual(fs.existsSync(gitignorePath), true, 'Missing .gitignore');

const configPath = path.join(__dirname, 'quality_config.json');
assert.strictEqual(fs.existsSync(configPath), true, 'Missing quality_config.json');

// Test 2: Verify quality_config.json parseability
try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    assert.strictEqual(config.name, 'QualexDev Configuration', 'Incorrect configuration name');
    console.log('  ✓ quality_config.json verified and parsed successfully.');
} catch (e) {
    assert.fail(`Failed to validate quality_config.json: ${e.message}`);
}

// Test 3: Verify syntax of quality_dev.js
try {
    require('./quality_dev.js');
    console.log('  ✓ quality_dev.js loaded successfully.');
} catch (e) {
    assert.fail(`Failed to import quality_dev.js: ${e.message}`);
}

console.log('✅ All QualexDev tests passed successfully.');
