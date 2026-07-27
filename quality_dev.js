#!/usr/bin/env node
/**
 * QualityDev CLI - Node.js Edition
 * Sistema Autónomo de Desarrollo Basado en Calidad y Verificación.
 * Compatible con tareas de larga duración (long-running jobs), IAs Locales y en la nube.
 * 
 * Uso:
 *   node quality_dev.js --prompt "Refactorizar proyecto pesado" --timeout 3600
 *   node quality_dev.js --prompt "Entrenar / Generar modulo" --endpoint http://127.0.0.1:8080 --timeout 0
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const VERSION = "1.6.0";

class LocalAIClient {
    /** Permite conectar con servidores de IA Locales soportando tareas de larga duración (sin timeout o timeout extendido) */
    static async query(prompt, endpoint = 'http://127.0.0.1:8080', model = 'local-model', timeoutSeconds = 3600) {
        const urlObj = new URL(endpoint);
        const host = urlObj.hostname;
        const port = parseInt(urlObj.port || '80', 10);

        const payloads = [
            { path: '/completion', data: JSON.stringify({ prompt: prompt, n_predict: 1000 }) },
            { path: '/v1/chat/completions', data: JSON.stringify({ model: model, messages: [{ role: 'user', content: prompt }], max_tokens: 2000 }) },
            { path: '/api/generate', data: JSON.stringify({ model: model, prompt: prompt, stream: false }) }
        ];

        for (const target of payloads) {
            try {
                const response = await this.sendHttpRequest(host, port, target.path, target.data, timeoutSeconds);
                if (response && response.trim().length > 0) return response;
            } catch (e) {
                // Probar siguiente payload si el endpoint no existía
            }
        }
        throw new Error(`No se obtuvo respuesta del servidor de IA en ${endpoint} tras la espera.`);
    }

    static sendHttpRequest(host, port, pathStr, postData, timeoutSeconds = 3600) {
        return new Promise((resolve, reject) => {
            const timeoutMs = (timeoutSeconds && timeoutSeconds > 0) ? timeoutSeconds * 1000 : 0; // 0 = sin límite

            const req = http.request({
                hostname: host,
                port: port,
                path: pathStr,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
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
                    reject(new Error(`La tarea excedió el tiempo límite de ${timeoutSeconds}s`));
                });
            }

            req.on('error', (err) => reject(err));
            req.write(postData);
            req.end();
        });
    }
}

class LogWriter {
    static saveLog(rootDir, report, isPending = false) {
        const logFilePath = path.join(rootDir, 'QUALITY_LOG.md');
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        let statusIcon = '⏳ TAREA EN PROCESO (ASÍNCRONA / LARGA DURACIÓN)';
        if (!isPending) {
            statusIcon = (report.syntax_results.valid && report.test_results.passed) ? '✅ SISTEMA FUNCIONAL' : '❌ ERRORES DETECTADOS';
        }

        let entry = `\n## 📅 Registro [${timestamp}] - ${statusIcon}\n\n`;
        entry += `- **Tarea / Prompt**: ${report.prompt}\n`;
        entry += `- **Stack Tecnológico**: ${report.stack_info.languages.join(', ') || 'No detectado'}\n`;
        entry += `- **Proveedor de IA**: ${report.ai_provider || 'Agente / CLI'}\n`;
        entry += `- **Modo de Ejecución**: ${report.timeout > 0 ? `Límite de ${report.timeout}s` : 'Sin límite de tiempo (Long-Running)'}\n`;
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
    detect() {
        const info = { languages: [], test_runner: null, test_command: null, has_gui: false, gui_type: null };
        const packageJsonPath = path.join(this.rootDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            info.languages.push('JavaScript/TypeScript');
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                const scripts = pkg.scripts || {};
                const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
                if (scripts.test) { info.test_runner = 'npm test'; info.test_command = 'npm test'; }
                else if (deps.vitest) { info.test_runner = 'vitest'; info.test_command = 'npx vitest run'; }
                else if (deps.jest) { info.test_runner = 'jest'; info.test_command = 'npx jest'; }
                if (deps.react || deps.vue || deps.svelte || deps.next || deps.vite) {
                    info.has_gui = true; info.gui_type = 'Web App (Framework Frontend)';
                }
            } catch (e) {}
        }
        const pyFiles = fs.readdirSync(this.rootDir).filter(f => f.endsWith('.py'));
        if (fs.existsSync(path.join(this.rootDir, 'requirements.txt')) || fs.existsSync(path.join(this.rootDir, 'pyproject.toml')) || pyFiles.length > 0) {
            info.languages.push('Python');
            if (!info.test_runner) {
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
            questions.push(`5. [Interfaz Gráfica / UX]: Para ${stackInfo.gui_type}, ¿la interfaz se ve moderna, es responsive y responde fluidamente?`);
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

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { prompt: 'Tarea sin descripción especificada', dir: '.', questions: false, json: false, endpoint: 'http://127.0.0.1:8080', model: 'local-model', test_llm: false, timeout: 3600 };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--prompt' && args[i + 1]) result.prompt = args[++i];
        if (args[i] === '--dir' && args[i + 1]) result.dir = args[++i];
        if (args[i] === '--questions') result.questions = true;
        if (args[i] === '--json') result.json = true;
        if (args[i] === '--endpoint' && args[i + 1]) { result.endpoint = args[++i]; result.test_llm = true; }
        if (args[i] === '--model' && args[i + 1]) result.model = args[++i];
        if (args[i] === '--test-llm') result.test_llm = true;
        if (args[i] === '--timeout' && args[i + 1]) result.timeout = parseInt(args[++i], 10);
    }
    return result;
}

async function main() {
    const options = parseArgs();
    const targetDir = path.resolve(options.dir);

    if (!fs.existsSync(targetDir)) {
        console.error(`Error: La carpeta especificada '${targetDir}' no existe.`);
        process.exit(1);
    }

    const detector = new StackDetector(targetDir);
    const stackInfo = detector.detect();
    const questionsData = QuestionFormulator.generate(options.prompt, stackInfo);

    if (options.questions) {
        if (options.json) {
            console.log(JSON.stringify(questionsData, null, 2));
        } else {
            console.log('\n=== MATRIZ DE AUTO-PREGUNTAS QUALITYDEV ===');
            console.log(`Tarea: ${options.prompt}`);
            console.log(`Stack Detectado: ${questionsData.stack}`);
            console.log(`GUI Presente: ${questionsData.has_gui ? 'Sí' : 'No'}\n`);
            questionsData.questions.forEach(q => console.log(q));
        }
        return;
    }

    const syntaxResults = SyntaxChecker.validate(targetDir);
    const runner = new TestRunner(targetDir);
    const testResults = runner.run(stackInfo.test_command, options.timeout);
    const suggestions = ImprovementAnalyzer.analyze(targetDir, stackInfo, testResults, syntaxResults);

    let aiProvider = 'Agente IDE / Local';
    if (options.test_llm || options.endpoint) {
        aiProvider = `llama.cpp / Ollama Server (${options.endpoint})`;
        console.log(`\n⏳ Ejecutando tarea con IA Local (${options.endpoint}). Tiempo límite: ${options.timeout > 0 ? options.timeout + 's' : 'Ilimitado'}...`);
        try {
            const aiResponse = await LocalAIClient.query(`Formula 2 recomendaciones breves para esta tarea: ${options.prompt}`, options.endpoint, options.model, options.timeout);
            console.log(`\n--- RESPUESTA RECIBIDA DE IA LOCAL (${options.endpoint}) ---\n${aiResponse}\n--------------------------------------------------------------`);
        } catch (e) {
            console.log(`⚠️ Advertencia IA Local: ${e.message}`);
        }
    }

    const report = {
        version: VERSION,
        directory: targetDir,
        prompt: options.prompt,
        ai_provider: aiProvider,
        timeout: options.timeout,
        stack_info: stackInfo,
        questions: questionsData.questions,
        syntax_results: syntaxResults,
        test_results: testResults,
        improvement_suggestions: suggestions
    };

    const logPath = LogWriter.saveLog(targetDir, report);

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log('\n=======================================================');
        console.log('    QUALITYDEV - REPORTE DE EJECUCIÓN Y MEJORA    ');
        console.log('=======================================================');
        console.log(`📁 Proyecto: ${path.basename(targetDir)} (${targetDir})`);
        console.log(`🛠️  Stack: ${stackInfo.languages.length ? stackInfo.languages.join(', ') : 'Desconocido'}`);
        console.log(`🤖 Proveedor de IA: ${aiProvider}`);
        console.log(`⏱️  Timeout de Tarea: ${options.timeout > 0 ? options.timeout + 's (Configurable)' : 'Ilimitado (Long-Running)'}`);
        console.log(`🖥️  Interfaz Gráfica: ${stackInfo.has_gui ? 'Sí (' + stackInfo.gui_type + ')' : 'No'}`);
        if (logPath) console.log(`📝 Log Registrado en: ${path.basename(logPath)}`);
        console.log('-------------------------------------------------------');
        console.log('📄 VERIFICACIÓN DE SINTAXIS Y ESTRUCTURA DE ARCHIVOS:');
        console.log(`  • Archivos inspeccionados: ${syntaxResults.filesChecked}`);
        console.log(`  • Sintaxis y Estructura: ${syntaxResults.valid ? '✅ CORRECTA' : '❌ ERRORES DETECTADOS'}`);
        if (!syntaxResults.valid) syntaxResults.errors.forEach(err => console.log(`    - ${err}`));
        console.log('-------------------------------------------------------');
        printSuggestions(suggestions);
    }
}

function printSuggestions(suggestions) {
    console.log('💡 SUGERENCIAS DE MEJORA FUTURA:');
    suggestions.forEach((sug, idx) => console.log(`  ${idx + 1}. ${sug}`));
    console.log('=======================================================\n');
}

main();
