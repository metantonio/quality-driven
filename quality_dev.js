#!/usr/bin/env node
/**
 * QualexDev CLI v2.1.0 - Interactive Shell & REPL Edition
 * Quality-Driven Autonomous Development & Verification System.
 * 
 * Run in interactive terminal mode or direct CLI command mode:
 *   - node quality_dev.js                      (Launches QualexDev Interactive Shell)
 *   - node quality_dev.js --prompt "My task"  (Direct execution)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');
const { execSync } = require('child_process');

const VERSION = "2.1.0";

class ConfigLoader {
    static loadConfig(rootDir, configPathOverride) {
        const defaultConfig = {
            ai_provider: 'Local AI / Agent',
            local_ai: {
                endpoint: 'http://127.0.0.1:8080',
                model: 'local-model',
                timeout_seconds: 3600
            },
            testing: {
                auto_detect_stack: true,
                custom_test_command: null,
                timeout_seconds: 120
            },
            logging: {
                log_file: 'QUALEX_LOG.md',
                auto_append: true
            }
        };

        const targetFile = configPathOverride ? path.resolve(configPathOverride) : path.join(rootDir, 'quality_config.json');

        if (fs.existsSync(targetFile)) {
            try {
                const fileContent = fs.readFileSync(targetFile, 'utf-8');
                const userConfig = JSON.parse(fileContent);
                return {
                    ...defaultConfig,
                    ...userConfig,
                    local_ai: { ...defaultConfig.local_ai, ...(userConfig.local_ai || {}) },
                    testing: { ...defaultConfig.testing, ...(userConfig.testing || {}) },
                    logging: { ...defaultConfig.logging, ...(userConfig.logging || {}) }
                };
            } catch (e) {
                console.error(`⚠️ Error loading ${targetFile}: ${e.message}`);
            }
        }
        return defaultConfig;
    }
}

class LocalAIClient {
    static async detectActiveModel(endpoint) {
        try {
            const urlObj = new URL(endpoint);
            const host = urlObj.hostname;
            const port = parseInt(urlObj.port || '80', 10);
            const body = await this.sendHttpRequest(host, port, '/v1/models', null, 'GET', 3000);
            const parsed = JSON.parse(body);
            if (parsed.data && parsed.data[0] && parsed.data[0].id) {
                return parsed.data[0].id;
            }
        } catch (e) {
            try {
                const urlObj = new URL(endpoint);
                const propsBody = await this.sendHttpRequest(urlObj.hostname, parseInt(urlObj.port || '80', 10), '/props', null, 'GET', 3000);
                const props = JSON.parse(propsBody);
                if (props.default_generation_settings && props.default_generation_settings.model) {
                    return props.default_generation_settings.model;
                }
            } catch (e2) {}
        }
        return null;
    }

    static async query(prompt, endpoint = 'http://127.0.0.1:8080', model = 'local-model', timeoutSeconds = 3600) {
        const urlObj = new URL(endpoint);
        const host = urlObj.hostname;
        const port = parseInt(urlObj.port || '80', 10);

        const payloads = [
            { path: '/completion', data: JSON.stringify({ prompt: prompt, n_predict: 500 }) },
            { path: '/v1/chat/completions', data: JSON.stringify({ model: model, messages: [{ role: 'user', content: prompt }], max_tokens: 500 }) },
            { path: '/api/generate', data: JSON.stringify({ model: model, prompt: prompt, stream: false }) }
        ];

        for (const target of payloads) {
            try {
                const response = await this.sendHttpRequest(host, port, target.path, target.data, 'POST', timeoutSeconds * 1000);
                if (response && response.trim().length > 0) return response;
            } catch (e) {}
        }
        throw new Error(`Could not obtain a valid response from local AI server at ${endpoint}`);
    }

    static sendHttpRequest(host, port, pathStr, postData, method = 'POST', timeoutMs = 3600000) {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: host,
                port: port,
                path: pathStr,
                method: method,
                headers: postData ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                } : {}
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsed = JSON.parse(body);
                            let textOutput = '';
                            if (parsed.content !== undefined) textOutput = parsed.content;
                            else if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) textOutput = parsed.choices[0].message.content;
                            else if (parsed.response !== undefined) textOutput = parsed.response;
                            else textOutput = body;

                            textOutput = textOutput.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                            resolve(textOutput);
                        } catch (e) {
                            resolve(body.replace(/<think>[\s\S]*?<\/think>/gi, '').trim());
                        }
                    } else {
                        reject(new Error(`HTTP Status ${res.statusCode}`));
                    }
                });
            });

            if (timeoutMs > 0) {
                req.setTimeout(timeoutMs, () => {
                    req.destroy();
                    reject(new Error(`Timeout after ${timeoutMs / 1000}s`));
                });
            }

            req.on('error', (err) => reject(err));
            if (postData) req.write(postData);
            req.end();
        });
    }
}

class LogWriter {
    static saveLog(rootDir, report, logFileName = 'QUALEX_LOG.md') {
        const logFilePath = path.join(rootDir, logFileName);
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const statusIcon = (report.syntax_results.valid && report.test_results.passed) ? '✅ SYSTEM FUNCTIONAL' : '❌ ERRORS DETECTED';

        let entry = `\n## 📅 Log Entry [${timestamp}] - ${statusIcon}\n\n`;
        entry += `- **Task / Prompt**: ${report.prompt}\n`;
        entry += `- **Tech Stack**: ${report.stack_info.languages.join(', ') || 'Not detected'}\n`;
        entry += `- **AI Provider**: ${report.ai_provider || 'Agent / CLI'}\n`;
        if (report.detected_model && report.detected_model !== report.configured_model) {
            entry += `- **Active Server Model**: \`${report.detected_model}\` (Configured: \`${report.configured_model}\`)\n`;
        }
        entry += `- **Syntax & Structure**: ${report.syntax_results.valid ? '✅ Valid' : '❌ Syntax Errors'} (${report.syntax_results.filesChecked} files checked)\n`;
        entry += `- **Live Test Execution**: ${report.test_results.executed ? (report.test_results.passed ? '✅ PASSED' : '❌ FAILED') : '⚪ Skipped'}\n`;
        if (report.test_results.command) {
            entry += `- **Test Command**: \`${report.test_results.command}\`\n`;
        }
        
        if (report.test_results.console_summary && report.test_results.console_summary.length > 0) {
            entry += `\n### 🖥️ Console / Terminal Output:\n\`\`\`text\n`;
            report.test_results.console_summary.forEach(line => {
                entry += `${line}\n`;
            });
            entry += `\`\`\`\n`;
        }

        entry += `\n### 💡 Prospective Improvements:\n`;
        report.improvement_suggestions.forEach((sug, idx) => {
            entry += `${idx + 1}. ${sug}\n`;
        });

        entry += `\n---\n`;

        try {
            if (!fs.existsSync(logFilePath)) {
                const header = `# QUALEX_LOG - QualexDev Verification & Change Log\n\nThis file automatically logs dates, task prompts, test status, and system health after each task.\n\n---\n`;
                fs.writeFileSync(logFilePath, header + entry, 'utf-8');
            } else {
                fs.appendFileSync(logFilePath, entry, 'utf-8');
            }
            return logFilePath;
        } catch (e) {
            return null;
        }
    }
}

class SyntaxChecker {
    static validate(rootDir) {
        const results = { valid: true, filesChecked: 0, errors: [] };
        const ignoreDirs = ['node_modules', '.git', '__pycache__', '.pytest_cache', 'dist', 'build', 'venv'];

        function scan(dir) {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    if (!ignoreDirs.includes(item.name)) scan(fullPath);
                } else if (item.isFile()) {
                    results.filesChecked++;
                    const ext = path.extname(item.name).toLowerCase();
                    if (ext === '.json') {
                        try {
                            JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
                        } catch (e) {
                            results.valid = false;
                            results.errors.push(`[JSON Syntax Error] ${path.relative(rootDir, fullPath)}: ${e.message}`);
                        }
                    }
                    if (ext === '.js') {
                        try {
                            execSync(`node --check "${fullPath}"`, { stdio: 'pipe' });
                        } catch (e) {
                            results.valid = false;
                            results.errors.push(`[JavaScript Syntax Error] ${path.relative(rootDir, fullPath)}: ${e.stderr ? e.stderr.toString().trim() : e.message}`);
                        }
                    }
                }
            }
        }
        try { scan(rootDir); } catch (e) { results.errors.push(`Error scanning directory: ${e.message}`); }
        return results;
    }
}

class StackDetector {
    constructor(rootDir) { this.rootDir = rootDir; }
    detect(customTestCommand = null) {
        const info = { languages: [], test_runner: null, test_command: customTestCommand, has_gui: false, gui_type: null };
        if (customTestCommand) info.test_runner = 'Custom Command';

        const packageJsonPath = path.join(this.rootDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            info.languages.push('JavaScript/TypeScript');
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                const scripts = pkg.scripts || {};
                const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
                if (!info.test_command) {
                    if (scripts.test) { info.test_runner = 'npm test'; info.test_command = 'npm test'; }
                    else if (deps.vitest) { info.test_runner = 'vitest'; info.test_command = 'npx vitest run'; }
                    else if (deps.jest) { info.test_runner = 'jest'; info.test_command = 'npx jest'; }
                }
                if (deps.react || deps.vue || deps.svelte || deps.next || deps.vite) {
                    info.has_gui = true; info.gui_type = 'Web App (Frontend Framework)';
                }
            } catch (e) {}
        }
        const pyFiles = fs.readdirSync(this.rootDir).filter(f => f.endsWith('.py'));
        if (fs.existsSync(path.join(this.rootDir, 'requirements.txt')) || fs.existsSync(path.join(this.rootDir, 'pyproject.toml')) || pyFiles.length > 0) {
            info.languages.push('Python');
            if (!info.test_command) {
                info.test_runner = 'pytest / unittest'; info.test_command = 'pytest -v || python -m unittest';
            }
        }
        if (fs.existsSync(path.join(this.rootDir, 'index.html'))) {
            if (!info.languages.includes('JavaScript/TypeScript')) info.languages.push('HTML/CSS');
            info.has_gui = true; if (!info.gui_type) info.gui_type = 'Static Web (HTML/CSS)';
        }
        return info;
    }
}

class QuestionFormulator {
    static generate(prompt, stackInfo) {
        const languages = stackInfo.languages.length > 0 ? stackInfo.languages.join(', ') : 'Not detected';
        const questions = [
            `1. [Main Requirement]: How does the proposed solution satisfy the instruction: '${prompt}'?`,
            `2. [Architecture & Stack]: For the ${languages} environment, what are the key abstractions and modules?`,
            `3. [Edge Cases & Security]: How are null/empty inputs, network timeouts, or unexpected exceptions handled?`,
            `4. [Testing & Console Logs]: Have terminal console logs (stdout/stderr) been inspected to rule out runtime errors?`
        ];
        if (stackInfo.has_gui) {
            questions.push(`5. [GUI / UX Verification]: For ${stackInfo.gui_type}, is the UI modern, responsive, and aesthetically balanced?`);
            questions.push(`6. [Browser Console]: Have browser console logs been audited for unhandled JS errors or 404/500 requests?`);
        }
        return { prompt, stack: languages, has_gui: stackInfo.has_gui, questions };
    }
}

class TestRunner {
    constructor(rootDir) { this.rootDir = rootDir; }
    run(testCommand, timeoutSeconds = 120) {
        if (!testCommand) return { executed: false, passed: false, message: 'No automated test runner detected in this repository.', output: '', console_summary: [] };
        try {
            const timeoutMs = (timeoutSeconds && timeoutSeconds > 0) ? timeoutSeconds * 1000 : 3600000;
            const output = execSync(testCommand, { cwd: this.rootDir, encoding: 'utf-8', timeout: timeoutMs, stdio: 'pipe' });
            const lines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            return { executed: true, passed: true, command: testCommand, output: output.trim(), console_summary: lines.slice(-10) };
        } catch (error) {
            const combinedOutput = (error.stdout || '') + '\n' + (error.stderr || '') + '\n' + (error.message || '');
            const lines = combinedOutput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            return { executed: true, passed: false, command: testCommand, output: combinedOutput.trim(), console_summary: lines.filter(l => l.toLowerCase().includes('error') || l.toLowerCase().includes('fail') || l.toLowerCase().includes('warning')) };
        }
    }
}

class ImprovementAnalyzer {
    static analyze(rootDir, stackInfo, testResults, syntaxResults) {
        const suggestions = [];
        if (!fs.existsSync(path.join(rootDir, 'README.md'))) suggestions.push('📝 Add a `README.md` file with project setup, architecture, and usage instructions.');
        if (!fs.existsSync(path.join(rootDir, '.gitignore'))) suggestions.push('🛡️ Add `.gitignore` to prevent committing build artifacts or temporary files.');
        if (!syntaxResults.valid) suggestions.push('⚠️ Resolve detected file syntax and structural errors prior to execution.');
        if (!testResults.executed) suggestions.push('🧪 Configure an automated testing framework (`jest/vitest` for JS/TS, `pytest` for Python).');
        else if (!testResults.passed) suggestions.push('⚠️ Review console logs and fix reported terminal test failures.');
        if (stackInfo.has_gui) {
            suggestions.push('🎨 Incorporate visual regression or E2E tests using Playwright/Cypress.');
            suggestions.push('♿ Audit accessibility (WCAG) and browser console error logs.');
        }
        suggestions.push('🚀 Setup Continuous Integration (CI/CD) pipelines with GitHub Actions.');
        return suggestions;
    }
}

async function executeTask(userPrompt, options, targetDir, fileConfig) {
    console.log(`\n-------------------------------------------------------`);
    console.log(`🚀 EXECUTING TASK: "${userPrompt}"`);
    console.log(`-------------------------------------------------------`);

    console.log(`[1/5] 📄 Inspecting file syntax and structure...`);
    const syntaxResults = SyntaxChecker.validate(targetDir);
    console.log(`     Files checked: ${syntaxResults.filesChecked} | Status: ${syntaxResults.valid ? '✅ VALID' : '❌ SYNTAX ERRORS'}`);

    const detector = new StackDetector(targetDir);
    const stackInfo = detector.detect(options.custom_test_command);

    console.log(`[2/5] ❓ Formulating self-questioning matrix and acceptance criteria...`);
    const questionsData = QuestionFormulator.generate(userPrompt, stackInfo);

    console.log(`[3/5] 🧪 Running automated test suite and inspecting console logs...`);
    const runner = new TestRunner(targetDir);
    const testResults = runner.run(stackInfo.test_command, options.timeout);
    console.log(`     Test Suite: ${testResults.executed ? (testResults.passed ? '✅ PASSED' : '❌ FAILED') : '⚪ SKIPPED'}`);

    console.log(`[4/5] 🦙 Connecting to local AI server (${options.endpoint})...`);
    const detectedModel = await LocalAIClient.detectActiveModel(options.endpoint);
    let aiProvider = fileConfig.ai_provider || 'llama.cpp Server';
    if (detectedModel) {
        console.log(`     Active server model: ${detectedModel}`);
    }
    
    try {
        const aiResponse = await LocalAIClient.query(`Fulfill this task and outline key technical steps: ${userPrompt}`, options.endpoint, detectedModel || options.model, options.timeout);
        console.log(`\n--- 🤖 LOCAL AI RESPONSE ---\n${aiResponse}\n----------------------------`);
    } catch (e) {
        console.log(`⚠️  Local AI Warning: ${e.message}`);
    }

    console.log(`[5/5] 📝 Logging history and state to ${options.log_file}...`);
    const suggestions = ImprovementAnalyzer.analyze(targetDir, stackInfo, testResults, syntaxResults);

    const report = {
        version: VERSION,
        directory: targetDir,
        prompt: userPrompt,
        ai_provider: aiProvider,
        configured_model: options.model,
        detected_model: detectedModel,
        timeout: options.timeout,
        stack_info: stackInfo,
        questions: questionsData.questions,
        syntax_results: syntaxResults,
        test_results: testResults,
        improvement_suggestions: suggestions
    };

    const logPath = LogWriter.saveLog(targetDir, report, options.log_file);

    console.log(`=======================================================`);
    console.log(`   ✅ TASK COMPLETED | STATUS: ${syntaxResults.valid && testResults.passed ? 'SYSTEM FUNCTIONAL' : 'CHECK ISSUES'}`);
    console.log(`=======================================================\n`);
}

async function startInteractiveShell(options, targetDir, fileConfig) {
    const stackInfo = new StackDetector(targetDir).detect();
    console.log(`
===================================================================
    🖥️  QUALEXDEV INTERACTIVE REPL TERMINAL v${VERSION}
===================================================================
📁 Target Workspace : ${path.basename(targetDir)} (${targetDir})
🛠️  Detected Stack   : ${stackInfo.languages.join(', ') || 'Not detected'}
🤖 Local AI Server  : ${options.endpoint}
⚙️  Configuration   : quality_config.json loaded

Enter your task prompt below to run automated verification.
Type 'exit', 'quit', or 'q' to exit the terminal shell.
===================================================================
`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'QualexDev> '
    });

    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit' || input.toLowerCase() === 'q') {
            console.log('👋 Exiting QualexDev Interactive Shell. Goodbye!');
            rl.close();
            process.exit(0);
        }

        if (input.length > 0) {
            rl.pause();
            try {
                await executeTask(input, options, targetDir, fileConfig);
            } catch (e) {
                console.error(`❌ Execution error: ${e.message}`);
            }
            rl.resume();
        }
        rl.prompt();
    });
}

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { prompt: null, dir: '.', questions: false, json: false, config: null, interactive: false };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--prompt' && args[i + 1]) result.prompt = args[++i];
        if (args[i] === '--dir' && args[i + 1]) result.dir = args[++i];
        if (args[i] === '--questions') result.questions = true;
        if (args[i] === '--json') result.json = true;
        if (args[i] === '--config' && args[i + 1]) result.config = args[++i];
        if (args[i] === '--endpoint' && args[i + 1]) result.endpoint = args[++i];
        if (args[i] === '--model' && args[i + 1]) result.model = args[++i];
        if (args[i] === '--interactive' || args[i] === '-i') result.interactive = true;
    }
    return result;
}

async function main() {
    const cliOptions = parseArgs();
    const targetDir = path.resolve(cliOptions.dir);

    if (!fs.existsSync(targetDir)) {
        console.error(`Error: Specified directory '${targetDir}' does not exist.`);
        process.exit(1);
    }

    const fileConfig = ConfigLoader.loadConfig(targetDir, cliOptions.config);

    const options = {
        prompt: cliOptions.prompt,
        endpoint: cliOptions.endpoint || fileConfig.local_ai.endpoint,
        model: cliOptions.model || fileConfig.local_ai.model,
        timeout: cliOptions.timeout !== undefined ? cliOptions.timeout : fileConfig.local_ai.timeout_seconds,
        questions: cliOptions.questions || false,
        json: cliOptions.json || false,
        log_file: fileConfig.logging.log_file || 'QUALEX_LOG.md',
        custom_test_command: fileConfig.testing.custom_test_command
    };

    if (!cliOptions.prompt || cliOptions.interactive) {
        await startInteractiveShell(options, targetDir, fileConfig);
    } else {
        await executeTask(cliOptions.prompt, options, targetDir, fileConfig);
    }
}

main();
