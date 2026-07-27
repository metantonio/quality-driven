/**
 * Unit Verification Tests for QualexDev v3.0.0
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running unit verification test suite for QualexDev v3.0.0...');

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

const configPath = path.join(__dirname, 'qualex_config.json');
assert.strictEqual(fs.existsSync(configPath), true, 'Missing qualex_config.json');

// Test 2: Verify package.json global bin declarations
try {
    const pkgContent = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgContent);
    assert.strictEqual(pkg.bin.qualex, 'quality_dev.js', 'qualex bin mapping missing');
    assert.strictEqual(pkg.bin.qualexdev, 'quality_dev.js', 'qualexdev bin mapping missing');
    console.log('  ✓ package.json verified with global CLI bin declarations (qualex, qualexdev).');
} catch (e) {
    assert.fail(`Failed to validate package.json bin configuration: ${e.message}`);
}

// Test 3: Verify qualex_config.json parseability
try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    assert.strictEqual(config.name, 'QualexDev Configuration', 'Incorrect configuration name');
    console.log('  ✓ qualex_config.json verified and parsed successfully.');
} catch (e) {
    assert.fail(`Failed to validate qualex_config.json: ${e.message}`);
}

// Test 4: Verify syntax of quality_dev.js
try {
    require('./quality_dev.js');
    console.log('  ✓ quality_dev.js loaded successfully with Auto-Skill Copy & Web Dashboard support.');
} catch (e) {
    assert.fail(`Failed to import quality_dev.js: ${e.message}`);
}

console.log('✅ All QualexDev v3.0.0 tests passed successfully.');
