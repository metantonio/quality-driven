#!/usr/bin/env node
/**
 * QualityDev CLI v2.0.0 - Interactive Shell & REPL Edition
 * Sistema Autónomo de Desarrollo Basado en Calidad y Verificación.
 * 
 * Permite ejecutar en modo CLI estándar o en MODO TERMINAL INTERACTIVA (REPL):
 *   - node quality_dev.js                      (Abre la terminal interactiva)
 *   - node quality_dev.js --prompt "Mi tarea" (Ejecución directa)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');
const { execSync } = require('child_process');

const VERSION = "2.0.0";

class ConfigLoader {
    static loadConfig(rootDir, configPathOverride) {
        const defaultConfig = {
            ai_provider: 'Agente / CLI',
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
                log_file: 'QUALITY_LOG.md',
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
                console.error(`⚠️ Error leyendo ${targetFile}: ${e.message}`);
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
        throw new Error(`No se obtuvo respuesta del servidor de IA en ${endpoint}`);
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
                        reject(new Error(`Status HTTP ${res.statusCode}`));
                    }
                });
            });

            if (timeoutMs > 0) {
                req.setTimeout(timeoutMs, () => {
                    req.destroy();
                    reject(new Error(`Timeout tras ${timeoutMs / 1000}s`));
                });
            }

            req.on('error', (err) => reject(err));
            if (postData) req.write(postData);
            req.end();
        });
    }
}

class LogWriter {
    static saveLog(rootDir, report, logFileName = 'QUALITY_LOG.md') {
        const logFilePath = path.join(rootDir, logFileName);
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const statusIcon = (report.syntax_results.valid && report.test_results.passed) ? '✅ SISTEMA FUNCIONAL' : '❌ ERRORES DETECTADOS';

        let entry = `\n## 📅 Registro [${timestamp}] - ${statusIcon}\n\n`;
        entry += `- **Tarea / Prompt**: ${report.prompt}\n`;
        entry += `- **Stack Tecnológico**: ${report.stack_info.languages.join(', ') || 'No detectado'}\n`;
        entry += `- **Proveedor de IA**: ${report.ai_provider || 'Agente / CLI'}\n`;
        if (report.detected_model && report.detected_model !== report.configured_model) {
            entry += `- **Modelo Detectado en Servidor**: \`${report.detected_model}\` (Configurado: \`${report.configured_model}\`)\n`;
        }
        entry += `- **Sintaxis & Estructura**: ${report.syntax_results.valid ? '✅ Correcta' : '❌ Errores detectados'} (${report.syntax_results.filesChecked} archivos)\n`;
        entry += `- **Ejecución Real & Tests**: ${report.test_results.executed ? (report.test_results.passed ? '✅ EXITOSAS' : '❌ FALLIDAS') : '⚪ No ejecutados'}\n`;
        if (report.test_results.command) {
            entry += `- **Comando de Test**: \`${report.test_results.command}\`\n`;
        }
        
        if (report.test_results.console_summary && report.test_results.console_summary.length > 0) {
            entry += `\n### 🖥️ Salida de Consola / Terminal:\n\`\`\`text\n`;
            report.test_results.console_summary.forEach(line => {
                entry += `${line}\n`;
            });
            entry += `\`\`\`\n`;
        }

        entry += `\n### 💡 Sugerencias de Mejora Pendientes:\n`;
        report.improvement_suggestions.forEach((sug, idx) => {
            entry += `${idx + 1}. ${sug}\n`;
        });

        entry += `\n---\n`;

        try {
            if (!fs.existsSync(logFilePath)) {
                const header = `# QUALITY_LOG - Historial de Verificación y Cambios QualityDev\n\nEste archivo registra automáticamente la fecha, cambios y el estado funcional del proyecto tras cada tarea ejecutada.\n\n---\n`;
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
        try { scan(rootDir); } catch (e) { results.errors.push(`Error al escanear: ${e.message}`); }
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
                    info.has_gui = true; info.gui_type = 'Web App (Framework Frontend)';
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
            info.has_gui = true; if (!info.gui_type) info.gui_type = 'Web Estática (HTML/CSS)';
        }
        return info;
    }
}

class QuestionFormulator {
    static generate(prompt, stackInfo) {
        const languages = stackInfo.languages.length > 0 ? stackInfo.languages.join(', ') : 'No detectado';
        const questions = [
            `1. [Requerimiento Principal]: ¿Cómo satisface la solución propuesta la instrucción: '${prompt}'?`,
            `2. [Arquitectura & Stack]: Para el entorno ${languages}, ¿cuáles son las abstracciones y módulos principales?`,
            `3. [Edge Cases & Seguridad]: ¿Qué ocurre con entradas nulas, vacías, errores de red o excepciones imprevistas?`,
            `4. [Pruebas & Salida de Consola]: ¿Se han inspeccionado los logs de consola (stdout/stderr) para descartar errores en tiempo de ejecución?`
        ];
        if (stackInfo.has_gui) {
            questions.push(`5. [Interfaz Gráfica / UX]: Para ${stackInfo.gui_type}, ¿la interfaz se ve moderna, es responsive and responde fluidamente?`);
            questions.push(`6. [Consola del Navegador]: ¿Se han verificado los logs de consola del navegador en busca de errores JS o 404/500?`);
        }
        return { prompt, stack: languages, has_gui: stackInfo.has_gui, questions };
    }
}

class TestRunner {
    constructor(rootDir) { this.rootDir = rootDir; }
    run(testCommand, timeoutSeconds = 120) {
        if (!testCommand) return { executed: false, passed: false, message: 'No se detectó un comando de pruebas automático en este repositorio.', output: '', console_summary: [] };
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
        if (!fs.existsSync(path.join(rootDir, 'README.md'))) suggestions.push('📝 Agregar un archivo `README.md` con documentación del proyecto, instalación y comandos de uso.');
        if (!fs.existsSync(path.join(rootDir, '.gitignore'))) suggestions.push('🛡️ Añadir `.gitignore` para prevenir la inclusión no deseada de temporales o dependencias.');
        if (!syntaxResults.valid) suggestions.push('⚠️ Corregir los errores de sintaxis/estructura de archivos detectados antes de ejecutar el proyecto.');
        if (!testResults.executed) suggestions.push('🧪 Configurar una suite de pruebas automatizada (`jest/vitest` para JS, `pytest` para Python).');
        else if (!testResults.passed) suggestions.push('⚠️ Revisar los logs de consola y corregir los errores reportados en la terminal.');
        if (stackInfo.has_gui) {
            suggestions.push('🎨 Incorporar pruebas de regresión visual o E2E con herramientas como Playwright.');
            suggestions.push('♿ Auditar accesibilidad (WCAG) y la consola del navegador en busca de errores JS.');
        }
        suggestions.push('🚀 Configurar un pipeline de Integración Continua (CI/CD) con GitHub Actions.');
        return suggestions;
    }
}

async function executeTask(userPrompt, options, targetDir, fileConfig) {
    console.log(`\n-------------------------------------------------------`);
    console.log(`🚀 EJECUTANDO TAREA: "${userPrompt}"`);
    console.log(`-------------------------------------------------------`);

    console.log(`[1/5] 📄 Inspeccionando sintaxis y estructura de archivos...`);
    const syntaxResults = SyntaxChecker.validate(targetDir);
    console.log(`     Archivos inspeccionados: ${syntaxResults.filesChecked} | Estado: ${syntaxResults.valid ? '✅ CORRECTA' : '❌ ERRORES'}`);

    const detector = new StackDetector(targetDir);
    const stackInfo = detector.detect(options.custom_test_command);

    console.log(`[2/5] ❓ Formulando matriz de auto-preguntas y criterios...`);
    const questionsData = QuestionFormulator.generate(userPrompt, stackInfo);

    console.log(`[3/5] 🧪 Ejecutando suite de pruebas automatizadas y logs...`);
    const runner = new TestRunner(targetDir);
    const testResults = runner.run(stackInfo.test_command, options.timeout);
    console.log(`     Pruebas: ${testResults.executed ? (testResults.passed ? '✅ PASARON' : '❌ FALLARON') : '⚪ OMITIDAS'}`);

    console.log(`[4/5] 🦙 Conectando con servidor de IA local (${options.endpoint})...`);
    const detectedModel = await LocalAIClient.detectActiveModel(options.endpoint);
    let aiProvider = fileConfig.ai_provider || 'llama.cpp Server';
    if (detectedModel) {
        console.log(`     Modelo activo detectado: ${detectedModel}`);
    }
    
    try {
        const aiResponse = await LocalAIClient.query(`Satisface esta tarea e indica los pasos clave: ${userPrompt}`, options.endpoint, detectedModel || options.model, options.timeout);
        console.log(`\n--- 🤖 RESPUESTA DE LA IA LOCAL ---\n${aiResponse}\n----------------------------------`);
    } catch (e) {
        console.log(`⚠️  Advertencia IA: ${e.message}`);
    }

    console.log(`[5/5] 📝 Registrando historial y estado en ${options.log_file}...`);
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
    console.log(`   ✅ TAREA FINALIZADA | ESTADO: ${syntaxResults.valid && testResults.passed ? 'SISTEMA FUNCIONAL' : 'REVISAR FALLOS'}`);
    console.log(`=======================================================\n`);
}

async function startInteractiveShell(options, targetDir, fileConfig) {
    console.log(`
===================================================================
    🖥️  QUALITYDEV INTERACTIVE REPL TERMINAL v${VERSION}
===================================================================
📁 Proyecto Objetivo : ${path.basename(targetDir)} (${targetDir})
🛠️  Stack Detectado  : ${new StackDetector(targetDir).detect().languages.join(', ') || 'No detectado'}
🤖 Servidor IA Local : ${options.endpoint}
⚙️  Configuración    : quality_config.json cargado

Escribe tu prompt abajo para ejecutar una tarea con verificación automática.
Escribe 'exit' o 'quit' para salir de la terminal.
===================================================================
`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'QualityDev> '
    });

    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit' || input.toLowerCase() === 'q') {
            console.log('👋 Saliendo de QualityDev. ¡Hasta pronto!');
            rl.close();
            process.exit(0);
        }

        if (input.length > 0) {
            rl.pause();
            try {
                await executeTask(input, options, targetDir, fileConfig);
            } catch (e) {
                console.error(`❌ Error durante la ejecución: ${e.message}`);
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
        console.error(`Error: La carpeta especificada '${targetDir}' no existe.`);
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
        log_file: fileConfig.logging.log_file || 'QUALITY_LOG.md',
        custom_test_command: fileConfig.testing.custom_test_command
    };

    // Si no se especificó un prompt mediante argument o si se especificó --interactive, iniciar Terminal REPL
    if (!cliOptions.prompt || cliOptions.interactive) {
        await startInteractiveShell(options, targetDir, fileConfig);
    } else {
        await executeTask(cliOptions.prompt, options, targetDir, fileConfig);
    }
}

main();
