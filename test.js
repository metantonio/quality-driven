/**
 * Unit & Web UI Automated Verification Test Suite for QualexDev v7.6.0
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('🧪 Running unit & Web UI verification test suite for QualexDev v7.6.0...\n');

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

console.log('  ✓ Core repository structure & system files verified.');

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

// Test 4: Import quality_dev.js and verify exports
let Qualex;
try {
    Qualex = require('./quality_dev.js');
    assert.ok(Qualex.DashboardServer, 'DashboardServer class not exported');
    assert.ok(Qualex.SessionManager, 'SessionManager class not exported');
    assert.ok(Qualex.ConfigLoader, 'ConfigLoader class not exported');
    assert.ok(Qualex.IntentDetector, 'IntentDetector class not exported');

    assert.ok(Qualex.CodeApplier, 'CodeApplier class not exported');

    assert.strictEqual(Qualex.IntentDetector.classify('dame más sugerencias para agregar a mi proyecto').mode, 'CHAT');
    assert.strictEqual(Qualex.IntentDetector.classify('explica cómo funciona test.js').mode, 'CHAT');
    assert.strictEqual(Qualex.IntentDetector.classify('ejecuta test.js').mode, 'TASK');
    assert.strictEqual(Qualex.IntentDetector.classify('refactoriza el módulo de sesiones').mode, 'TASK');
    assert.strictEqual(Qualex.IntentDetector.classify('/chat dime un consejo').mode, 'CHAT');
    assert.strictEqual(Qualex.IntentDetector.classify('/task run tests').mode, 'TASK');

    // Test CodeApplier
    const mockAiResponse = 'Here is the test file:\n\n```javascript:temp_test_sample.js\nconsole.log("hello test");\n```';
    const applied = Qualex.CodeApplier.apply(__dirname, mockAiResponse);
    assert.strictEqual(applied.length, 1);
    assert.strictEqual(applied[0].path, 'temp_test_sample.js');
    assert.ok(fs.existsSync(path.join(__dirname, 'temp_test_sample.js')));
    fs.unlinkSync(path.join(__dirname, 'temp_test_sample.js'));

    console.log('  ✓ quality_dev.js imported cleanly with full module exports, IntentDetector, and CodeApplier verified.');
} catch (e) {
    assert.fail(`Failed to import quality_dev.js: ${e.message}`);
}

// Helper function for HTTP requests in test suite
function makeHttpRequest(port, pathStr, method = 'GET', bodyData = null) {
    return new Promise((resolve, reject) => {
        const postData = bodyData ? JSON.stringify(bodyData) : null;
        const headers = postData ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        } : {};

        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: pathStr,
            method: method,
            headers: headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data, headers: res.headers }));
        });

        req.on('error', err => reject(err));
        if (postData) req.write(postData);
        req.end();
    });
}

// Test 5: Web UI & Dashboard HTTP API Automated Verification
async function runWebUiTestSuite() {
    console.log('\n🌐 Running Web Dashboard & HTTP API Automated Test Suite...');
    const TEST_PORT = 3099;
    const testConfig = Qualex.ConfigLoader.loadConfig(__dirname);
    const testOptions = {
        endpoint: 'http://127.0.0.1:8080',
        model: 'test-model',
        timeout: 10,
        max_tokens: 1024,
        log_file: 'QUALEX_LOG.md'
    };

    const server = Qualex.DashboardServer.start(__dirname, testOptions, testConfig, TEST_PORT);

    try {
        // 5.1 Test GET / (Web Dashboard Markup)
        const indexRes = await makeHttpRequest(TEST_PORT, '/');
        assert.strictEqual(indexRes.statusCode, 200, 'GET / failed');
        assert.ok(indexRes.body.includes('QualexDev AI Chat'), 'Dashboard markup missing title');
        assert.ok(indexRes.body.includes('Smart Scroll'), 'Dashboard markup missing Smart Scroll logic');
        console.log('  ✓ GET / returned 200 OK with valid ChatGPT-style HTML UI markup.');

        // 5.2 Test GET /api/status
        const statusRes = await makeHttpRequest(TEST_PORT, '/api/status');
        assert.strictEqual(statusRes.statusCode, 200, 'GET /api/status failed');
        const statusJson = JSON.parse(statusRes.body);
        assert.ok(statusJson.version, 'Status missing version');
        assert.ok(statusJson.providers, 'Status missing providers object');
        console.log(`  ✓ GET /api/status returned status metadata (Version: ${statusJson.version}, Stack: ${statusJson.stack.join(', ')}).`);

        // 5.3 Test GET /api/config
        const configRes = await makeHttpRequest(TEST_PORT, '/api/config');
        assert.strictEqual(configRes.statusCode, 200, 'GET /api/config failed');
        const loadedConfig = JSON.parse(configRes.body);
        assert.strictEqual(loadedConfig.name, 'QualexDev Configuration', 'Config JSON mismatch');
        console.log('  ✓ GET /api/config returned valid configuration JSON.');

        // 5.3.1 Test GET /api/skills
        const skillsRes = await makeHttpRequest(TEST_PORT, '/api/skills');
        assert.strictEqual(skillsRes.statusCode, 200, 'GET /api/skills failed');
        const skillsJson = JSON.parse(skillsRes.body);
        assert.ok(skillsJson.catalog.length >= 5, 'Catalog skills count mismatch');
        console.log(`  ✓ GET /api/skills returned skills catalog (${skillsJson.catalog.length} available).`);

        // 5.3.2 Test POST /api/skills/install and /api/skills/delete
        const installRes = await makeHttpRequest(TEST_PORT, '/api/skills/install', 'POST', { skill_id: 'vercel-deployment' });
        assert.strictEqual(installRes.statusCode, 200, 'POST /api/skills/install failed');
        assert.strictEqual(JSON.parse(installRes.body).status, 'installed');
        console.log('  ✓ POST /api/skills/install installed vercel-deployment skill.');

        const deleteSkillRes = await makeHttpRequest(TEST_PORT, '/api/skills/delete', 'POST', { skill_id: 'vercel-deployment' });
        assert.strictEqual(deleteSkillRes.statusCode, 200, 'POST /api/skills/delete failed');
        assert.strictEqual(JSON.parse(deleteSkillRes.body).status, 'deleted');
        console.log('  ✓ POST /api/skills/delete uninstalled vercel-deployment skill cleanly.');

        // 5.3.3 Test POST /api/skills/install_url (skills.sh link import)
        const installUrlRes = await makeHttpRequest(TEST_PORT, '/api/skills/install_url', 'POST', { url: 'https://www.skills.sh/vercel-labs/agent-skills/vercel-react-best-practices' });
        assert.strictEqual(installUrlRes.statusCode, 200, 'POST /api/skills/install_url failed');
        const installUrlJson = JSON.parse(installUrlRes.body);
        assert.strictEqual(installUrlJson.status, 'installed', 'skills.sh URL install failed');
        console.log(`  ✓ POST /api/skills/install_url imported custom skill [${installUrlJson.id}] directly from skills.sh!`);

        // Clean up test imported skill
        await makeHttpRequest(TEST_PORT, '/api/skills/delete', 'POST', { skill_id: installUrlJson.id });

        // 5.4 Test POST /api/sessions/new
        const newSessionRes = await makeHttpRequest(TEST_PORT, '/api/sessions/new', 'POST', { name: 'ui_automated_test' });
        assert.strictEqual(newSessionRes.statusCode, 200, 'POST /api/sessions/new failed');
        const newSessionJson = JSON.parse(newSessionRes.body);
        assert.strictEqual(newSessionJson.status, 'created', 'Session creation failed');
        assert.strictEqual(newSessionJson.active_session, 'ui_automated_test', 'Active session name mismatch');
        console.log('  ✓ POST /api/sessions/new created isolated session [ui_automated_test].');

        // 5.5 Test POST /api/sessions/switch
        const switchSessionRes = await makeHttpRequest(TEST_PORT, '/api/sessions/switch', 'POST', { session_id: 'ui_automated_test' });
        assert.strictEqual(switchSessionRes.statusCode, 200, 'POST /api/sessions/switch failed');
        assert.strictEqual(JSON.parse(switchSessionRes.body).status, 'switched', 'Session switch status error');
        console.log('  ✓ POST /api/sessions/switch switched active session context cleanly.');

        // 5.6 Test POST /api/execute (Instant Pending RUNNING Status)
        const execRes = await makeHttpRequest(TEST_PORT, '/api/execute', 'POST', { prompt: 'Automated Test Prompt for Web UI', provider: 'local' });
        assert.strictEqual(execRes.statusCode, 200, 'POST /api/execute failed');
        const execJson = JSON.parse(execRes.body);
        assert.strictEqual(execJson.status, 'started', 'Execution start failed');
        console.log('  ✓ POST /api/execute accepted prompt and registered instant RUNNING status ⏳.');

        // 5.7 Test GET /api/sessions/history
        const historyRes = await makeHttpRequest(TEST_PORT, '/api/sessions/history?session_id=ui_automated_test');
        assert.strictEqual(historyRes.statusCode, 200, 'GET /api/sessions/history failed');
        const historyJson = JSON.parse(historyRes.body);
        assert.ok(historyJson.prompt_history.length > 0, 'History empty after prompt execution');
        assert.strictEqual(historyJson.prompt_history[0].prompt, 'Automated Test Prompt for Web UI', 'Prompt string mismatch');
        console.log(`  ✓ GET /api/sessions/history verified real-time session prompt registration (${historyJson.prompt_history.length} item).`);

        // 5.8 Test GET /api/logs
        const logsRes = await makeHttpRequest(TEST_PORT, '/api/logs');
        assert.strictEqual(logsRes.statusCode, 200, 'GET /api/logs failed');
        assert.ok(JSON.parse(logsRes.body).content, 'Logs endpoint missing content field');
        console.log('  ✓ GET /api/logs returned log contents.');

        // 5.9 Test POST /api/config/save
        const saveConfigRes = await makeHttpRequest(TEST_PORT, '/api/config/save', 'POST', loadedConfig);
        assert.strictEqual(saveConfigRes.statusCode, 200, 'POST /api/config/save failed');
        assert.strictEqual(JSON.parse(saveConfigRes.body).status, 'saved', 'Save config failed');
        console.log('  ✓ POST /api/config/save validated config update pipeline.');

        // 5.10 Test POST /api/sessions/delete
        const deleteSessionRes = await makeHttpRequest(TEST_PORT, '/api/sessions/delete', 'POST', { session_id: 'ui_automated_test' });
        assert.strictEqual(deleteSessionRes.statusCode, 200, 'POST /api/sessions/delete failed');
        const deleteJson = JSON.parse(deleteSessionRes.body);
        assert.strictEqual(deleteJson.status, 'deleted', 'Session deletion status mismatch');
        assert.ok(deleteJson.active_session, 'Active session fallback missing after deletion');
        const deletedSessionDir = path.join(__dirname, '.agents', 'sessions', 'ui_automated_test');
        assert.strictEqual(fs.existsSync(deletedSessionDir), false, 'Session directory was not deleted from disk');
        console.log(`  ✓ POST /api/sessions/delete verified session deletion from disk and active session fallback to [${deleteJson.active_session}].`);

        console.log('\n✅ All Web Dashboard & HTTP API tests passed successfully!');
    } finally {
        server.close();
    }
}

runWebUiTestSuite().then(() => {
    console.log('\n======================================================');
    console.log('✅ ALL QUALEXDEV SYSTEM TESTS PASSED SUCCESSFULLY (v7.6.0)');
    console.log('======================================================');
    process.exit(0);
}).catch(err => {
    console.error(`\n❌ TEST SUITE FAILURE: ${err.message}`);
    process.exit(1);
});
