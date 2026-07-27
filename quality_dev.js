#!/usr/bin/env node
/**
 * QualityDev CLI - Node.js Edition
 * Sistema Autónomo de Desarrollo Basado en Calidad y Verificación.
 * 
 * Uso:
 *   node quality_dev.js --prompt "Crear modulo de autenticación" [--dir /ruta/al/repo]
 *   node quality_dev.js --test-only [--dir /ruta/al/repo]
 *   node quality_dev.js --questions --prompt "Título de la tarea"
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VERSION = "1.0.0";

class StackDetector {
    constructor(rootDir) {
        this.rootDir = rootDir;
    }

    detect() {
        const info = {
            languages: [],
            test_runner: null,
            test_command: null,
            has_gui: false,
            gui_type: null
        };

        // Detectar Node / JS / TS
        const packageJsonPath = path.join(this.rootDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            info.languages.push('JavaScript/TypeScript');
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                const scripts = pkg.scripts || {};
                const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

                if (scripts.test) {
                    info.test_runner = 'npm test';
                    info.test_command = 'npm test';
                } else if (deps.vitest) {
                    info.test_runner = 'vitest';
                    info.test_command = 'npx vitest run';
                } else if (deps.jest) {
                    info.test_runner = 'jest';
                    info.test_command = 'npx jest';
                }

                if (deps.react || deps.vue || deps.svelte || deps.next || deps.vite) {
                    info.has_gui = true;
                    info.gui_type = 'Web App (Framework Frontend)';
                }
            } catch (e) {}
        }

        // Detectar Python
        const pyFiles = fs.readdirSync(this.rootDir).filter(f => f.endsWith('.py'));
        if (fs.existsSync(path.join(this.rootDir, 'requirements.txt')) || fs.existsSync(path.join(this.rootDir, 'pyproject.toml')) || pyFiles.length > 0) {
            info.languages.push('Python');
            if (!info.test_runner) {
                info.test_runner = 'pytest / unittest';
                info.test_command = 'pytest -v || python -m unittest';
            }
        }

        // Detectar HTML estático
        if (fs.existsSync(path.join(this.rootDir, 'index.html'))) {
            if (!info.languages.includes('JavaScript/TypeScript')) {
                info.languages.push('HTML/CSS');
            }
            info.has_gui = true;
            if (!info.gui_type) info.gui_type = 'Web Estática (HTML/CSS)';
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
            `4. [Pruebas Automatizadas]: ¿Qué pruebas unitarias/integrales validarás con '${stackInfo.test_runner || 'tests manuales'}'?`
        ];

        if (stackInfo.has_gui) {
            questions.push(`5. [Interfaz Gráfica / UX]: Para ${stackInfo.gui_type}, ¿la interfaz se ve moderna, es responsive y responde fluidamente?`);
            questions.push(`6. [Visual Verification]: ¿Se han verificado capturas de pantalla o renderizado en navegador?`);
        }

        return { prompt, stack: languages, has_gui: stackInfo.has_gui, questions };
    }
}

class TestRunner {
    constructor(rootDir) {
        this.rootDir = rootDir;
    }

    run(testCommand) {
        if (!testCommand) {
            return {
                executed: false,
                passed: false,
                message: 'No se detectó un comando de pruebas automático en este repositorio.',
                output: ''
            };
        }

        try {
            const output = execSync(testCommand, {
                cwd: this.rootDir,
                encoding: 'utf-8',
                timeout: 120000,
                stdio: 'pipe'
            });
            return {
                executed: true,
                passed: true,
                command: testCommand,
                output: output.trim()
            };
        } catch (error) {
            return {
                executed: true,
                passed: false,
                command: testCommand,
                output: (error.stdout || '') + '\n' + (error.stderr || '') + '\n' + (error.message || '')
            };
        }
    }
}

class ImprovementAnalyzer {
    static analyze(rootDir, stackInfo, testResults) {
        const suggestions = [];
        if (!fs.existsSync(path.join(rootDir, 'README.md'))) {
            suggestions.push('📝 Agregar un archivo `README.md` con documentación del proyecto, instalación y comandos de uso.');
        }
        if (!fs.existsSync(path.join(rootDir, '.gitignore'))) {
            suggestions.push('🛡️ Añadir `.gitignore` para prevenir la inclusión no deseada de temporales o dependencias.');
        }
        if (!testResults.executed) {
            suggestions.push('🧪 Configurar una suite de pruebas automatizada (`jest/vitest` para JS, `pytest` para Python).');
        } else if (!testResults.passed) {
            suggestions.push('⚠️ Corregir los fallos reportados en la suite de pruebas automatizadas antes de pasar a producción.');
        }
        if (stackInfo.has_gui) {
            suggestions.append ? null : suggestions.push('🎨 Incorporar pruebas de regresión visual o E2E con herramientas como Playwright.');
            suggestions.push('♿ Auditar accesibilidad (WCAG) y contraste de colores en la interfaz gráfica.');
        }
        suggestions.push('🚀 Configurar un pipeline de Integración Continua (CI/CD) con GitHub Actions.');
        return suggestions;
    }
}

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { prompt: 'Tarea sin descripción especificada', dir: '.', questions: false, json: false };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--prompt' && args[i + 1]) result.prompt = args[++i];
        if (args[i] === '--dir' && args[i + 1]) result.dir = args[++i];
        if (args[i] === '--questions') result.questions = true;
        if (args[i] === '--json') result.json = true;
    }
    return result;
}

function main() {
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

    const runner = new TestRunner(targetDir);
    const testResults = runner.run(stackInfo.test_command);
    const suggestions = ImprovementAnalyzer.analyze(targetDir, stackInfo, testResults);

    if (options.json) {
        console.log(JSON.stringify({
            version: VERSION,
            directory: targetDir,
            prompt: options.prompt,
            stack_info: stackInfo,
            questions: questionsData.questions,
            test_results: testResults,
            improvement_suggestions: suggestions
        }, null, 2));
    } else {
        console.log('\n=======================================================');
        console.log('    QUALITYDEV - REPORTE DE EJECUCIÓN Y MEJORA    ');
        console.log('=======================================================');
        console.log(`📁 Proyecto: ${path.basename(targetDir)} (${targetDir})`);
        console.log(`🛠️  Stack: ${stackInfo.languages.length ? stackInfo.languages.join(', ') : 'Desconocido'}`);
        console.log(`🖥️  Interfaz Gráfica: ${stackInfo.has_gui ? 'Sí (' + stackInfo.gui_type + ')' : 'No'}`);
        console.log('-------------------------------------------------------');
        console.log('❓ PREGUNTAS Y PLANTEAMIENTO CRÍTICO:');
        questionsData.questions.forEach(q => console.log(`  • ${q}`));
        console.log('-------------------------------------------------------');
        console.log('🧪 PRUEBAS AUTOMATIZADAS:');
        if (testResults.executed) {
            const status = testResults.passed ? '✅ EXITOSAS' : '❌ FALLIDAS';
            console.log(`  • Comando: ${testResults.command}`);
            console.log(`  • Estado: ${status}`);
            if (!testResults.passed) {
                console.log(`\n--- SALIDA DE ERRORES ---\n${testResults.output}\n------------------------`);
            }
        } else {
            console.log(`  • ${testResults.message}`);
        }
        console.log('-------------------------------------------------------');
        console.log('💡 SUGERENCIAS DE MEJORA FUTURA:');
        suggestions.forEach((sug, idx) => console.log(`  ${idx + 1}. ${sug}`));
        console.log('=======================================================\n');
    }
}

main();
