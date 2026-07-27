#!/usr/bin/env node
/**
 * QualexDev CLI v7.6.0 - Web UI & API Automated Verification Suite
 * Quality-Driven Autonomous Development & Verification System.
 * 
 * Web Dashboard Estilo ChatGPT (http://localhost:3000):
 *   - Auto-scroll inteligente: solo desplaza al final en nuevos envíos o mientras hay tareas 'RUNNING' ⏳
 *   - Cero tirones de scroll cuando el usuario está leyendo respuestas completadas
 *   - Event Listeners puros en JS (0 inline onclick/onkeydown attributes)
 *   - Sidebar con lista de Chats / Sesiones independientes (➕ New Chat)
 *   - ⚙️ Config Editor & 🌐 Dependency Graph integrados
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const readline = require('readline');
const { execSync } = require('child_process');

const VERSION = "7.6.0";
const SYSTEM_SKILL_NAME = "quality-driven-dev";

class SessionManager {
    static getSessionsDir(rootDir) {
        const sessionsDir = path.join(rootDir, '.agents', 'sessions');
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
        }
        return sessionsDir;
    }

    static createSession(rootDir, sessionName = null) {
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14);
        const sanitizeName = sessionName ? sessionName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : `session_${timestamp}`;
        const sessionDir = path.join(this.getSessionsDir(rootDir), sanitizeName);

        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
            const meta = {
                id: sanitizeName,
                created_at: new Date().toISOString(),
                prompt_history: []
            };
            fs.writeFileSync(path.join(sessionDir, 'session_meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
            fs.writeFileSync(path.join(sessionDir, 'SESSION_LOG.md'), `# Session Log: ${sanitizeName}\n\n`, 'utf-8');
        }
        return sanitizeName;
    }

    static listSessions(rootDir) {
        const sessionsDir = this.getSessionsDir(rootDir);
        const items = fs.readdirSync(sessionsDir, { withFileTypes: true });
        const sessions = [];
        for (const item of items) {
            if (item.isDirectory()) {
                const metaPath = path.join(sessionsDir, item.name, 'session_meta.json');
                let meta = { id: item.name, created_at: 'Unknown', prompt_history: [] };
                if (fs.existsSync(metaPath)) {
                    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch (e) {}
                }
                sessions.push(meta);
            }
        }
        return sessions;
    }

    static deleteSession(rootDir, sessionId) {
        const sessionDir = path.join(this.getSessionsDir(rootDir), sessionId);
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            return true;
        }
        return false;
    }

    static getSessionDetails(rootDir, sessionId) {
        const sessionDir = path.join(this.getSessionsDir(rootDir), sessionId);
        const metaPath = path.join(sessionDir, 'session_meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            } catch (e) {}
        }
        return { id: sessionId, created_at: 'Unknown', prompt_history: [] };
    }

    static addPendingPrompt(rootDir, sessionId, prompt, providerKey) {
        const sessionDir = path.join(this.getSessionsDir(rootDir), sessionId);
        const metaPath = path.join(sessionDir, 'session_meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                const existingIndex = meta.prompt_history.findIndex(item => item.prompt === prompt && item.status === 'RUNNING');
                if (existingIndex === -1) {
                    meta.prompt_history.push({
                        timestamp: new Date().toISOString(),
                        prompt: prompt,
                        provider: providerKey || 'local',
                        status: 'RUNNING',
                        ai_response: null,
                        warning: null
                    });
                    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
                }
            } catch (e) {}
        }
    }

    static updateSessionPromptReport(rootDir, sessionId, prompt, report) {
        const sessionDir = path.join(this.getSessionsDir(rootDir), sessionId);
        const metaPath = path.join(sessionDir, 'session_meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                let taskStatus = (report.syntax_results && report.syntax_results.valid && report.test_results && report.test_results.passed) ? 'SUCCESS' : 'FAILED';
                if (report.ai_warning) taskStatus = 'AI WARNING';

                const runningIndex = meta.prompt_history.findIndex(item => item.prompt === prompt && item.status === 'RUNNING');
                const entry = {
                    timestamp: new Date().toISOString(),
                    prompt: prompt,
                    provider: report.ai_provider_key || 'local',
                    status: taskStatus,
                    ai_response: report.ai_response || null,
                    warning: report.ai_warning || null
                };

                if (runningIndex !== -1) {
                    meta.prompt_history[runningIndex] = entry;
                } else {
                    meta.prompt_history.push(entry);
                }
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
            } catch (e) {}
        }
    }

    static getSessionHistoryContext(rootDir, sessionId) {
        const sessionDir = path.join(this.getSessionsDir(rootDir), sessionId);
        const metaPath = path.join(sessionDir, 'session_meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                if (meta.prompt_history && meta.prompt_history.length > 0) {
                    let ctx = `\nActive Session Context (${sessionId} - ${meta.prompt_history.length} previous tasks):\n`;
                    meta.prompt_history.slice(-5).forEach((item, idx) => {
                        ctx += `${idx + 1}. [${item.status}] [Provider: ${item.provider || 'local'}] Task: ${item.prompt}\n`;
                    });
                    return ctx;
                }
            } catch (e) {}
        }
        return `\nActive Session Context (${sessionId}): Clean / Isolated Session State.\n`;
    }
}

class SkillInstaller {
    static ensureSkillAndConfig(rootDir) {
        const configPath = path.join(rootDir, 'qualex_config.json');
        if (!fs.existsSync(configPath)) {
            const defaultConfig = {
                "$schema": "https://json.schemastore.org/json",
                "name": "QualexDev Configuration",
                "version": VERSION,
                "active_provider": "local",
                "ai_providers": {
                    "local": {
                        "name": "Local AI (llama.cpp / Ollama)",
                        "type": "llama.cpp",
                        "endpoint": "http://127.0.0.1:8080",
                        "model": "Ternary-Bonsai-27B-Q2_0.gguf",
                        "api_key": "",
                        "timeout_seconds": 60,
                        "max_tokens": 8192,
                        "temperature": 0.7
                    },
                    "gemini": {
                        "name": "Google Gemini 3.6 Pro",
                        "type": "gemini",
                        "endpoint": "https://generativelanguage.googleapis.com/v1beta",
                        "model": "gemini-3.6-pro",
                        "api_key": "",
                        "timeout_seconds": 120,
                        "max_tokens": 8192
                    },
                    "ollama": {
                        "name": "Ollama Local Model",
                        "type": "openai_compatible",
                        "endpoint": "http://127.0.0.1:11434/v1",
                        "model": "qwen3.6-27b.gguf",
                        "api_key": "",
                        "timeout_seconds": 60,
                        "max_tokens": 8192
                    }
                },
                "testing": {
                    "auto_detect_stack": true,
                    "custom_test_command": null,
                    "timeout_seconds": 120
                },
                "logging": {
                    "log_file": "QUALEX_LOG.md",
                    "auto_append": true,
                    "max_log_size_kb": 250,
                    "max_recent_entries": 10
                }
            };
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
            console.log(`✨ [QualexDev] Created qualex_config.json in ${rootDir}`);
        }

        const skillDir = path.join(rootDir, '.agents', 'skills', SYSTEM_SKILL_NAME);
        const skillFilePath = path.join(skillDir, 'SKILL.md');

        if (!fs.existsSync(skillFilePath)) {
            fs.mkdirSync(skillDir, { recursive: true });
            const skillContent = `---
name: quality-driven-dev
description: Workflow autónomo de desarrollo orientado a la calidad con soporte Multi-IA.
---

# Workflow Autónomo QualexDev (Desarrollo Orientado a Calidad y Verificación)
`;
            fs.writeFileSync(skillFilePath, skillContent, 'utf-8');
            console.log(`✨ [QualexDev] Initialized Skill (.agents/skills/${SYSTEM_SKILL_NAME}/SKILL.md) in ${rootDir}`);
        }
    }
}

class ConfigLoader {
    static loadConfig(rootDir, configPathOverride) {
        const defaultConfig = {
            active_provider: 'local',
            ai_providers: {
                local: {
                    name: "Local AI (llama.cpp)",
                    type: "llama.cpp",
                    endpoint: "http://127.0.0.1:8080",
                    model: "Ternary-Bonsai-27B-Q2_0.gguf",
                    timeout_seconds: 60,
                    max_tokens: 8192,
                    temperature: 0.7
                }
            },
            testing: { auto_detect_stack: true, custom_test_command: null, timeout_seconds: 120 },
            logging: { log_file: "QUALEX_LOG.md", auto_append: true, max_log_size_kb: 250, max_recent_entries: 10 }
        };

        let targetFile = configPathOverride ? path.resolve(configPathOverride) : path.join(rootDir, 'qualex_config.json');
        if (!fs.existsSync(targetFile) && !configPathOverride) {
            const fallbackFile = path.join(rootDir, 'quality_config.json');
            if (fs.existsSync(fallbackFile)) targetFile = fallbackFile;
        }

        if (fs.existsSync(targetFile)) {
            try {
                const userConfig = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
                return {
                    ...defaultConfig,
                    ...userConfig,
                    config_file_used: path.basename(targetFile),
                    ai_providers: { ...defaultConfig.ai_providers, ...(userConfig.ai_providers || {}) },
                    testing: { ...defaultConfig.testing, ...(userConfig.testing || {}) },
                    logging: { ...defaultConfig.logging, ...(userConfig.logging || {}) }
                };
            } catch (e) {
                console.error(`⚠️ Error loading ${targetFile}: ${e.message}`);
            }
        }
        return { ...defaultConfig, config_file_used: 'default' };
    }

    static saveConfig(rootDir, newConfig) {
        const targetFile = path.join(rootDir, 'qualex_config.json');
        try {
            fs.writeFileSync(targetFile, JSON.stringify(newConfig, null, 2), 'utf-8');
            return true;
        } catch (e) {
            console.error(`⚠️ Error saving ${targetFile}: ${e.message}`);
            return false;
        }
    }

    static loadSkillPrompt(rootDir) {
        const skillPath = path.join(rootDir, '.agents', 'skills', SYSTEM_SKILL_NAME, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
            try { return fs.readFileSync(skillPath, 'utf-8'); } catch (e) {}
        }
        return 'Follow a strict 5-phase quality-driven development workflow with surgical code inspection.';
    }
}

class DependencyMapper {
    static mapProjectDependencies(rootDir) {
        const graph = {};
        const ignoreDirs = ['node_modules', '.git', '__pycache__', '.pytest_cache', 'dist', 'build', 'venv'];
        const importRegex = /(?:import\s+.*?from\s+['"](.*?)['"]|require\s*\(\s*['"](.*?)['"]\s*\)|from\s+([^\s]+)\s+import)/gi;

        function scan(dir) {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    if (!ignoreDirs.includes(item.name)) scan(fullPath);
                } else if (item.isFile()) {
                    const ext = path.extname(item.name).toLowerCase();
                    if (['.js', '.ts', '.py', '.jsx', '.tsx', '.json'].includes(ext)) {
                        const relPath = path.relative(rootDir, fullPath);
                        graph[relPath] = [];
                        try {
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            let match;
                            while ((match = importRegex.exec(content)) !== null) {
                                const targetImport = match[1] || match[2] || match[3];
                                if (targetImport && !targetImport.startsWith('node:') && !targetImport.includes('http')) {
                                    graph[relPath].push(targetImport);
                                }
                            }
                        } catch (e) {}
                    }
                }
            }
        }
        try { scan(rootDir); } catch (e) {}
        return graph;
    }
}

class LogCompactor {
    static compactIfNeeded(rootDir, logFileName = 'QUALEX_LOG.md', maxKb = 250, maxRecentEntries = 10) {
        const logPath = path.join(rootDir, logFileName);
        if (!fs.existsSync(logPath)) return false;

        try {
            const stats = fs.statSync(logPath);
            const fileSizeKb = stats.size / 1024;
            if (fileSizeKb < maxKb) return false;

            console.log(`🧹 [LogCompactor] Compacting ${logFileName} (${fileSizeKb.toFixed(1)} KB > ${maxKb} KB)...`);
            const content = fs.readFileSync(logPath, 'utf-8');
            const entries = content.split(/^## 📅 /m);
            if (entries.length <= maxRecentEntries + 1) return false;

            const header = entries[0].trim();
            const oldEntries = entries.slice(1, entries.length - maxRecentEntries);
            const recentEntries = entries.slice(entries.length - maxRecentEntries);

            let compactedSummary = `\n### 📜 Archived & Compacted Logs Summary (${oldEntries.length} entries consolidated)\n`;
            oldEntries.forEach(entry => {
                const firstLine = entry.split('\n')[0] || '';
                const taskLine = (entry.match(/- \*\*Task \/ Prompt\*\*: (.*)/) || [])[1] || 'Task execution';
                compactedSummary += `- [${firstLine.trim()}] Task: ${taskLine}\n`;
            });
            compactedSummary += `\n---\n`;

            const newContent = `${header}\n${compactedSummary}\n` + recentEntries.map(e => `## 📅 ${e}`).join('');
            fs.writeFileSync(logPath, newContent, 'utf-8');
            console.log(`✅ [LogCompactor] ${logFileName} compacted successfully.`);
            return true;
        } catch (e) {
            console.error(`⚠️ [LogCompactor] Error compacting log: ${e.message}`);
            return false;
        }
    }
}

class SurgicalCodeSearch {
    static searchSymbols(rootDir, symbolQuery) {
        const symbolsFound = [];
        const ignoreDirs = ['node_modules', '.git', '__pycache__', '.pytest_cache', 'dist', 'build', 'venv'];
        const symbolRegex = new RegExp(`(function\\s+${symbolQuery}|class\\s+${symbolQuery}|const\\s+${symbolQuery}\\s*=|def\\s+${symbolQuery})`, 'gi');

        function scan(dir) {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    if (!ignoreDirs.includes(item.name)) scan(fullPath);
                } else if (item.isFile()) {
                    const ext = path.extname(item.name).toLowerCase();
                    if (['.js', '.ts', '.py', '.jsx', '.tsx'].includes(ext)) {
                        try {
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            const lines = content.split('\n');
                            lines.forEach((line, index) => {
                                if (symbolRegex.test(line)) {
                                    const snippet = lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 15)).join('\n');
                                    symbolsFound.push({
                                        file: path.relative(rootDir, fullPath),
                                        line: index + 1,
                                        snippet: snippet
                                    });
                                }
                            });
                        } catch (e) {}
                    }
                }
            }
        }
        try { scan(rootDir); } catch (e) {}
        return symbolsFound;
    }

    static extractProjectStructure(rootDir) {
        const filesList = [];
        const ignoreDirs = ['node_modules', '.git', '__pycache__', '.pytest_cache', 'dist', 'build', 'venv'];

        function scan(dir) {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    if (!ignoreDirs.includes(item.name)) scan(fullPath);
                } else if (item.isFile()) {
                    filesList.push(path.relative(rootDir, fullPath));
                }
            }
        }
        try { scan(rootDir); } catch (e) {}
        return filesList.slice(0, 30);
    }
}

class MultiAIClient {
    static async detectActiveModel(providerConfig) {
        if (!providerConfig) return null;
        if (providerConfig.type === 'gemini') return providerConfig.model || 'gemini-3.6-pro';
        try {
            const urlObj = new URL(providerConfig.endpoint);
            const body = await this.sendHttpRequest(urlObj, '/v1/models', null, 'GET', 3000, providerConfig.api_key);
            const parsed = JSON.parse(body);
            if (parsed.data && parsed.data[0] && parsed.data[0].id) {
                return parsed.data[0].id;
            }
        } catch (e) {}
        return providerConfig.model || 'local-model';
    }

    static async query(providerConfig, prompt, skillInstructions, codeContext) {
        const pType = providerConfig.type || 'llama.cpp';
        const maxTokens = providerConfig.max_tokens || 8192;
        const model = providerConfig.model || 'local-model';
        const timeoutSeconds = providerConfig.timeout_seconds || 60;
        const endpoint = providerConfig.endpoint || 'http://127.0.0.1:8080';

        const fullPrompt = `System Instructions (QualexDev Skill):\n${skillInstructions}\n\nProject Structure & Code Context:\n${codeContext}\n\nTask Prompt: ${prompt}`;
        const urlObj = new URL(endpoint);

        if (pType === 'gemini') {
            const apiKey = providerConfig.api_key || process.env.GEMINI_API_KEY || '';
            const geminiPath = `/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const payload = JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }] }]
            });
            const raw = await this.sendHttpRequest(urlObj, geminiPath, payload, 'POST', timeoutSeconds * 1000);
            const parsed = JSON.parse(raw);
            return parsed.candidates[0].content.parts[0].text;
        }

        const payloads = [
            { path: '/completion', data: JSON.stringify({ prompt: fullPrompt, n_predict: maxTokens }) },
            { path: '/v1/chat/completions', data: JSON.stringify({ model: model, messages: [{ role: 'system', content: skillInstructions }, { role: 'user', content: `${codeContext}\n\n${prompt}` }], max_tokens: maxTokens }) },
            { path: '/api/generate', data: JSON.stringify({ model: model, prompt: fullPrompt, stream: false, options: { num_predict: maxTokens } }) }
        ];

        for (const target of payloads) {
            try {
                const response = await this.sendHttpRequest(urlObj, target.path, target.data, 'POST', timeoutSeconds * 1000, providerConfig.api_key);
                if (response && response.trim().length > 0) return response;
            } catch (e) {}
        }
        throw new Error(`Could not connect to AI provider '${providerConfig.name || pType}' at ${endpoint}. (Ensure local llama.cpp/Ollama server is running or API key is set)`);
    }

    static sendHttpRequest(urlObj, pathStr, postData, method = 'POST', timeoutMs = 60000, apiKey = null) {
        return new Promise((resolve, reject) => {
            const isHttps = urlObj.protocol === 'https:';
            const transport = isHttps ? https : http;
            const headers = postData ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            } : {};
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const req = transport.request({
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: pathStr.startsWith('/') ? pathStr : `/${pathStr}`,
                method: method,
                headers: headers
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
        let statusIcon = (report.syntax_results.valid && report.test_results.passed) ? '✅ SYSTEM FUNCTIONAL' : '❌ ERRORS DETECTED';
        if (report.ai_warning) statusIcon = '⚠️ AI PROVIDER WARNING';

        let entry = `\n## 📅 Log Entry [${timestamp}] - ${statusIcon}\n\n`;
        entry += `- **Active Session**: \`${report.active_session || 'default'}\`\n`;
        entry += `- **Task / Prompt**: ${report.prompt}\n`;
        entry += `- **AI Provider Selected**: \`${report.ai_provider_key || 'local'}\` (${report.ai_provider || 'Local AI'})\n`;
        if (report.ai_warning) {
            entry += `- **⚠️ AI Provider Warning / Error**: \`${report.ai_warning}\`\n`;
        }
        entry += `- **Tech Stack**: ${report.stack_info.languages.join(', ') || 'Not detected'}\n`;
        entry += `- **Skill Applied**: \`quality-driven-dev\` (.agents/skills/quality-driven-dev/SKILL.md)\n`;
        entry += `- **Config File Used**: \`${report.config_file_used}\` (Max Tokens: ${report.max_tokens})\n`;
        entry += `- **Dependency Graph**: ✅ Mapped (${Object.keys(report.dependency_graph || {}).length} file nodes linked)\n`;
        entry += `- **Surgical Code Inspection**: ✅ Symbol Search Active (${report.structure_files.length} project files indexed)\n`;
        entry += `- **Syntax & Structure**: ${report.syntax_results.valid ? '✅ Valid' : '❌ Syntax Errors'} (${report.syntax_results.filesChecked} files checked)\n`;
        entry += `- **Live Test Execution**: ${report.test_results.executed ? (report.test_results.passed ? '✅ PASSED' : '❌ FAILED') : '⚪ Skipped'}\n`;
        if (report.test_results.command) {
            entry += `- **Test Command**: \`${report.test_results.command}\`\n`;
        }

        if (report.ai_response) {
            entry += `\n### 🤖 AI Response Output\n\`\`\`text\n${report.ai_response}\n\`\`\`\n`;
        }

        entry += `\n---\n`;

        try {
            if (!fs.existsSync(logFilePath)) {
                const header = `# QUALEX_LOG - QualexDev Verification & Change Log\n\nThis file automatically logs dates, task prompts, test status, and system health after each task.\n\n---\n`;
                fs.writeFileSync(logFilePath, header + entry, 'utf-8');
            } else {
                fs.appendFileSync(logFilePath, entry, 'utf-8');
            }

            LogCompactor.compactIfNeeded(rootDir, logFileName, report.max_log_size_kb || 250, report.max_recent_entries || 10);
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
        }
        suggestions.push('🚀 Setup Continuous Integration (CI/CD) pipelines with GitHub Actions.');
        return suggestions;
    }
}

class IntentDetector {
    static classify(prompt) {
        if (!prompt || typeof prompt !== 'string') {
            return { mode: 'CHAT', reason: 'Empty prompt' };
        }
        const trimmed = prompt.trim();
        const lower = trimmed.toLowerCase();

        if (/^\/(chat|preguntar|pregunta|explicar|explain|ask)\b/i.test(trimmed)) {
            return { mode: 'CHAT', reason: 'Explicit chat directive (/chat)' };
        }
        if (/^\/(task|tarea|ejecutar|fix|refactor|test|run)\b/i.test(trimmed)) {
            return { mode: 'TASK', reason: 'Explicit task directive (/task)' };
        }

        const directCommands = [
            'ejecuta', 'ejecutar', 'run', 'build', 'compile', 'compila',
            'elimina', 'eliminar', 'borra', 'borrar', 'refactoriza', 'refactorizar',
            'fix', 'corregir', 'corrige', 'arregla', 'arreglar', 'instala', 'instalar',
            'commit', 'git push'
        ];
        const isDirectCommand = directCommands.some(verb => new RegExp(`\\b${verb}\\b`, 'i').test(lower));
        const isQuestionOrAdvice = /\b(dame|sugerencias|ideas|consejos|recomiendas|explicame|explica|como funciona|cómo funciona|que es|qué es|por que|por qué)\b/i.test(lower);

        if (isQuestionOrAdvice && !isDirectCommand) {
            return { mode: 'CHAT', reason: 'Conversational or informational question' };
        }

        if (isDirectCommand) {
            return { mode: 'TASK', reason: 'Matched direct action command verb' };
        }

        const actionVerbs = ['crea', 'crear', 'modifica', 'modificar', 'añade', 'añadir', 'agrega', 'agregar', 'add', 'actualiza', 'actualizar', 'implementa', 'implementar', 'escribe', 'escribir', 'reemplaza', 'reemplazar', 'guarda', 'guardar'];
        if (actionVerbs.some(verb => new RegExp(`\\b${verb}\\b`, 'i').test(lower))) {
            return { mode: 'TASK', reason: 'Matched action verb' };
        }

        if (/\b[a-z0-9_/-]+\.(js|py|json|md|html|css|ts|sh|yml|yaml)\b/i.test(lower)) {
            if (isQuestionOrAdvice) {
                return { mode: 'CHAT', reason: 'Explanation query about file' };
            }
            return { mode: 'TASK', reason: 'Targeted source code file' };
        }

        return { mode: 'CHAT', reason: 'General conversation' };
    }
}

class DashboardServer {
    static activeSessionId = 'default';
    static activeProviderKey = 'local';

    static start(targetDir, options, fileConfig, port = 3000) {
        const server = http.createServer((req, res) => {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);

            if (req.method === 'GET' && urlObj.pathname === '/api/config') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(ConfigLoader.loadConfig(targetDir)));
                return;
            }

            if (req.method === 'POST' && urlObj.pathname === '/api/config/save') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const parsed = JSON.parse(body || '{}');
                        const ok = ConfigLoader.saveConfig(targetDir, parsed);
                        if (ok) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ status: 'saved' }));
                        } else {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Save failed' }));
                        }
                    } catch (e) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            if (req.method === 'GET' && urlObj.pathname === '/api/sessions/history') {
                const targetSession = urlObj.searchParams.get('session_id') || this.activeSessionId;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(SessionManager.getSessionDetails(targetDir, targetSession)));
                return;
            }

            if (req.method === 'POST' && urlObj.pathname === '/api/sessions/new') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const parsed = JSON.parse(body || '{}');
                        const newId = SessionManager.createSession(targetDir, parsed.name);
                        this.activeSessionId = newId;
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'created', active_session: newId }));
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            if (req.method === 'POST' && urlObj.pathname === '/api/sessions/switch') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const parsed = JSON.parse(body || '{}');
                        if (parsed.session_id) {
                            this.activeSessionId = parsed.session_id;
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ status: 'switched', active_session: this.activeSessionId }));
                        } else {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Missing session_id' }));
                        }
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            if (req.method === 'POST' && urlObj.pathname === '/api/sessions/delete') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const parsed = JSON.parse(body || '{}');
                        if (parsed.session_id) {
                            const targetSession = parsed.session_id;
                            SessionManager.deleteSession(targetDir, targetSession);
                            if (this.activeSessionId === targetSession) {
                                const remaining = SessionManager.listSessions(targetDir);
                                this.activeSessionId = remaining.length > 0 ? remaining[0].id : SessionManager.createSession(targetDir, 'default');
                            }
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ status: 'deleted', active_session: this.activeSessionId }));
                        } else {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Missing session_id' }));
                        }
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            if (req.method === 'POST' && urlObj.pathname === '/api/execute') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const userPrompt = parsed.prompt;
                        const providerKey = parsed.provider || this.activeProviderKey;

                        if (userPrompt && userPrompt.trim().length > 0) {
                            SessionManager.addPendingPrompt(targetDir, this.activeSessionId, userPrompt, providerKey);

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ status: 'started', prompt: userPrompt, provider: providerKey, session: this.activeSessionId }));
                            
                            executeTask(userPrompt, options, targetDir, ConfigLoader.loadConfig(targetDir), this.activeSessionId, providerKey).catch(e => {
                                console.error(`❌ UI Async Parallel Execution Error: ${e.message}`);
                            });
                        } else {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Empty prompt' }));
                        }
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }
            
            if (urlObj.pathname === '/api/status') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                const currentConfig = ConfigLoader.loadConfig(targetDir);
                const stackInfo = new StackDetector(targetDir).detect();
                const depGraph = DependencyMapper.mapProjectDependencies(targetDir);
                const sessions = SessionManager.listSessions(targetDir);

                res.end(JSON.stringify({
                    version: VERSION,
                    project: path.basename(targetDir),
                    path: targetDir,
                    active_session: this.activeSessionId,
                    active_provider: currentConfig.active_provider || this.activeProviderKey,
                    providers: currentConfig.ai_providers || {},
                    sessions: sessions,
                    stack: stackInfo.languages,
                    modules_count: Object.keys(depGraph).length,
                    dependencies: depGraph
                }));
                return;
            }

            if (urlObj.pathname === '/api/logs') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                const logPath = path.join(targetDir, options.log_file);
                let logContent = 'No logs yet.';
                if (fs.existsSync(logPath)) {
                    logContent = fs.readFileSync(logPath, 'utf-8');
                }
                res.end(JSON.stringify({ content: logContent }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QualexDev AI Chat v${VERSION}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-sidebar: #171717;
            --bg-chat: #212121;
            --bg-input: #2f2f2f;
            --border-color: rgba(255, 255, 255, 0.15);
            --accent-cyan: #06b6d4;
            --accent-purple: #a855f7;
            --text-primary: #ececec;
            --text-secondary: #b4b4b4;
            --user-msg-bg: #2f2f2f;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: "Outfit", sans-serif;
            background: var(--bg-chat);
            color: var(--text-primary);
            height: 100vh;
            display: flex;
            overflow: hidden;
        }
        
        aside.sidebar {
            width: 260px;
            background: var(--bg-sidebar);
            display: flex;
            flex-direction: column;
            border-right: 1px solid var(--border-color);
            padding: 0.8rem;
        }
        .new-chat-btn {
            background: transparent;
            color: #fff;
            border: 1px solid var(--border-color);
            padding: 0.7rem 1rem;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1rem;
            transition: background 0.2s ease;
        }
        .new-chat-btn:hover { background: rgba(255, 255, 255, 0.08); }
        .session-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.3rem; }
        .session-item {
            padding: 0.6rem 0.8rem;
            border-radius: 6px;
            color: var(--text-secondary);
            font-size: 0.9rem;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .session-item-name {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
        }
        .session-item:hover, .session-item.active { background: rgba(255, 255, 255, 0.08); color: #fff; }
        .delete-session-btn {
            background: transparent;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 0.85rem;
            opacity: 0;
            padding: 2px 6px;
            border-radius: 4px;
            transition: all 0.2s ease;
        }
        .session-item:hover .delete-session-btn { opacity: 0.7; }
        .delete-session-btn:hover { opacity: 1 !important; color: #ff5555; background: rgba(255, 85, 85, 0.15); }

        main.chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            height: 100vh;
            position: relative;
        }
        header.chat-header {
            padding: 0.8rem 1.5rem;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(33, 33, 33, 0.8);
            backdrop-filter: blur(8px);
        }
        .header-title { font-weight: 600; font-size: 1.1rem; display: flex; align-items: center; gap: 0.6rem; }
        .nav-tools { display: flex; gap: 0.5rem; }
        .tool-btn {
            background: transparent;
            color: var(--text-secondary);
            border: none;
            padding: 0.4rem 0.8rem;
            border-radius: 6px;
            font-size: 0.85rem;
            cursor: pointer;
        }
        .tool-btn:hover, .tool-btn.active { color: #fff; background: rgba(255, 255, 255, 0.1); }

        .chat-feed {
            flex: 1;
            overflow-y: auto;
            padding: 2rem 15%;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }
        .msg-row {
            display: flex;
            gap: 1rem;
            width: 100%;
        }
        .msg-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 0.85rem;
            flex-shrink: 0;
        }
        .avatar-user { background: #54375b; color: #fff; }
        .avatar-ai { background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple)); color: #fff; }
        .msg-bubble {
            flex: 1;
            line-height: 1.6;
            font-size: 0.98rem;
        }
        .user-bubble {
            background: var(--user-msg-bg);
            padding: 0.8rem 1.2rem;
            border-radius: 12px;
            max-width: 85%;
        }
        .ai-bubble {
            background: transparent;
            color: var(--text-primary);
        }
        .status-badge {
            display: inline-block;
            padding: 0.2rem 0.6rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        .badge-success { background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981; }
        .badge-warning { background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b; }
        .badge-failed { background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; }
        .badge-running { background: rgba(6, 182, 212, 0.2); color: #06b6d4; border: 1px solid #06b6d4; animation: pulse 1.5s infinite; }

        @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

        .ai-response-box {
            white-space: pre-wrap;
            background: #171717;
            padding: 1rem;
            border-radius: 8px;
            font-family: monospace;
            font-size: 0.9rem;
            border: 1px solid var(--border-color);
        }
        .warning-box {
            color: #f59e0b;
            background: rgba(245, 158, 11, 0.1);
            padding: 0.6rem;
            border-radius: 6px;
            margin-bottom: 0.6rem;
        }
        .module-card {
            background: #171717;
            padding: 1rem;
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }
        .module-title {
            font-weight: 600;
            color: var(--accent-cyan);
            font-family: monospace;
            margin-bottom: 0.4rem;
        }
        .module-pill {
            background: rgba(168, 85, 247, 0.15);
            color: #c084fc;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-family: monospace;
            margin-right: 0.3rem;
        }

        .input-container {
            padding: 1rem 15% 1.5rem 15%;
            background: linear-gradient(180deg, transparent 0%, var(--bg-chat) 30%);
        }
        .input-box {
            background: var(--bg-input);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 0.8rem 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.6rem;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        textarea.chat-input {
            width: 100%;
            background: transparent;
            border: none;
            color: #fff;
            font-family: inherit;
            font-size: 1rem;
            resize: none;
            outline: none;
            min-height: 40px;
            max-height: 160px;
        }
        .input-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        select.provider-pill {
            background: rgba(255, 255, 255, 0.08);
            color: var(--accent-cyan);
            border: 1px solid rgba(6, 182, 212, 0.4);
            padding: 0.3rem 0.8rem;
            border-radius: 20px;
            font-size: 0.82rem;
            outline: none;
            cursor: pointer;
        }
        button.send-btn {
            background: #fff;
            color: #000;
            border: none;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            cursor: pointer;
            transition: transform 0.1s ease;
        }
        button.send-btn:hover { transform: scale(1.05); }

        .overlay-view {
            display: none;
            position: absolute;
            top: 55px; left: 0; right: 0; bottom: 0;
            background: var(--bg-chat);
            z-index: 50;
            padding: 2rem 15%;
            overflow-y: auto;
        }
        .overlay-view.active { display: block; }
        .config-textarea {
            width: 100%; height: 420px;
            background: #171717; color: #38bdf8;
            font-family: monospace;
            border: 1px solid var(--border-color);
            border-radius: 8px; padding: 1rem;
            font-size: 0.9rem; outline: none;
        }
    </style>
</head>
<body>
    <aside class="sidebar">
        <button class="new-chat-btn" id="new-chat-btn">
            <span>➕ New Chat</span>
            <span style="font-size:0.8rem; opacity:0.6;">Ctrl+K</span>
        </button>
        <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-secondary); margin-bottom:0.5rem; letter-spacing:0.05em;">Sessions</div>
        <div class="session-list" id="sidebar-sessions">Loading chats...</div>
    </aside>

    <main class="chat-container">
        <header class="chat-header">
            <div class="header-title">
                <span>🤖 QualexDev AI</span>
                <span style="font-size:0.8rem; color:var(--text-secondary);" id="hdr-session-id">default</span>
            </div>
            <div class="nav-tools">
                <button class="tool-btn active" id="btn-tab-chat" data-view="chat">💬 Chat Feed</button>
                <button class="tool-btn" id="btn-tab-config" data-view="config">⚙️ Config Editor</button>
                <button class="tool-btn" id="btn-tab-graph" data-view="graph">🌐 Dependency Graph</button>
            </div>
        </header>

        <!-- VIEW 1: CHAT FEED -->
        <div class="chat-feed" id="chat-feed">
            <div style="text-align:center; margin-top:3rem; color:var(--text-secondary);">
                <h2>How can QualexDev help your repository today?</h2>
                <p style="font-size:0.9rem; margin-top:0.5rem;">Quality-driven verification, syntax checks, symbol search & multi-AI execution.</p>
            </div>
        </div>

        <!-- VIEW 2: OVERLAY CONFIG EDITOR -->
        <div class="overlay-view" id="view-config">
            <h3 style="margin-bottom:1rem;">⚙️ Live qualex_config.json Editor</h3>
            <textarea id="cfg-textarea" class="config-textarea"></textarea>
            <div style="margin-top:1rem; display:flex; justify-content:flex-end; gap:1rem;">
                <button class="tool-btn" id="btn-cfg-reload">🔄 Reload</button>
                <button class="new-chat-btn" id="btn-cfg-save" style="margin:0;">💾 Save Config</button>
            </div>
        </div>

        <!-- VIEW 3: OVERLAY GRAPH MATRIX -->
        <div class="overlay-view" id="view-graph">
            <h3 style="margin-bottom:1rem;">🌐 Module Dependency Matrix</h3>
            <div id="graph-content" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:1rem;"></div>
        </div>

        <!-- FLOATING INPUT BAR -->
        <div class="input-container">
            <div class="input-box">
                <textarea class="chat-input" id="chat-textarea" placeholder="Message QualexDev AI... (e.g. Audit project security & run test suite)"></textarea>
                <div class="input-footer">
                    <select class="provider-pill" id="sel-provider-pill"></select>
                    <button class="send-btn" id="send-btn">⬆</button>
                </div>
            </div>
        </div>
    </main>

    <script>
        let activeSessionId = 'default';
        let lastRenderedSessionId = null;
        let userJustSentPrompt = false;

        function switchView(viewName, targetBtn) {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            if (targetBtn) targetBtn.classList.add('active');

            document.getElementById('view-config').classList.remove('active');
            document.getElementById('view-graph').classList.remove('active');

            if (viewName === 'config') {
                document.getElementById('view-config').classList.add('active');
                loadConfig();
            } else if (viewName === 'graph') {
                document.getElementById('view-graph').classList.add('active');
            }
        }

        async function sendMessage() {
            const input = document.getElementById('chat-textarea');
            const providerPill = document.getElementById('sel-provider-pill');
            const provider = providerPill ? providerPill.value : 'local';
            const promptVal = input.value.trim();
            if (!promptVal) return;

            input.value = '';
            userJustSentPrompt = true;

            try {
                const res = await fetch('/api/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: promptVal, provider: provider })
                });
                await res.json();
                fetchChatHistory();
            } catch(e) {
                console.error('Send Error:', e);
            }
        }

        async function fetchChatHistory() {
            try {
                const res = await fetch('/api/sessions/history?session_id=' + encodeURIComponent(activeSessionId));
                const data = await res.json();
                const feed = document.getElementById('chat-feed');
                const history = data.prompt_history || [];
                
                const isAtBottom = (feed.scrollHeight - feed.scrollTop - feed.clientHeight) < 100;
                const sessionChanged = (activeSessionId !== lastRenderedSessionId);

                if (history.length === 0) {
                    feed.innerHTML = '<div style="text-align:center; margin-top:3rem; color:var(--text-secondary);"><h2>How can QualexDev help your repository today?</h2><p style="font-size:0.9rem; margin-top:0.5rem;">Quality-driven verification, syntax checks, symbol search & multi-AI execution.</p></div>';
                    lastRenderedSessionId = activeSessionId;
                    return;
                }

                let html = '';
                let hasRunning = false;

                history.forEach(item => {
                    html += '<div class="msg-row" style="justify-content:flex-end;">';
                    html += '<div class="user-bubble">' + escapeHtml(item.prompt) + '</div>';
                    html += '<div class="msg-avatar avatar-user">U</div></div>';

                    let badge = 'badge-success';
                    let badgeLabel = item.status;
                    if (item.status === 'FAILED') badge = 'badge-failed';
                    if (item.status === 'AI WARNING') badge = 'badge-warning';
                    if (item.status === 'RUNNING') {
                        badge = 'badge-running';
                        badgeLabel = '⏳ Executing Task & Verifying Code...';
                        hasRunning = true;
                    }

                    html += '<div class="msg-row">';
                    html += '<div class="msg-avatar avatar-ai">Q</div>';
                    html += '<div class="msg-bubble ai-bubble">';
                    html += '<span class="status-badge ' + badge + '">' + escapeHtml(badgeLabel) + '</span>';
                    html += '<div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.5rem;">Provider: ' + escapeHtml(item.provider || 'local') + ' | ' + escapeHtml(item.timestamp || '') + '</div>';
                    
                    if (item.warning) {
                        html += '<div class="warning-box">⚠️ ' + escapeHtml(item.warning) + '</div>';
                    }
                    if (item.ai_response) {
                        html += '<div class="ai-response-box">' + escapeHtml(item.ai_response) + '</div>';
                    } else if (item.status === 'RUNNING') {
                        html += '<div style="color:var(--accent-cyan); font-style:italic;">Scanning syntax, running test suite, and obtaining AI response...</div>';
                    } else if (!item.warning) {
                        html += '<div style="color:var(--text-secondary); font-style:italic;">Task verification passed cleanly. Output logged to QUALEX_LOG.md.</div>';
                    }
                    html += '</div></div>';
                });

                feed.innerHTML = html;

                // Smart Scroll: Auto-scroll ONLY on initial session change, user sending prompt, or while running if user is already at bottom
                if (sessionChanged || userJustSentPrompt || (hasRunning && isAtBottom)) {
                    feed.scrollTop = feed.scrollHeight;
                    userJustSentPrompt = false;
                }
                lastRenderedSessionId = activeSessionId;
            } catch(e) {
                console.error('History Fetch Error:', e);
            }
        }

        async function createNewSession() {
            const name = prompt('Enter a title for the new Chat session:');
            if (!name) return;
            try {
                const res = await fetch('/api/sessions/new', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name })
                });
                const data = await res.json();
                if (data.active_session) {
                    activeSessionId = data.active_session;
                    userJustSentPrompt = true;
                    fetchStatus();
                    fetchChatHistory();
                }
            } catch(e) {
                console.error('New Session Error:', e);
            }
        }

        async function switchSession(sessId) {
            activeSessionId = sessId;
            try {
                await fetch('/api/sessions/switch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessId })
                });
                fetchStatus();
                fetchChatHistory();
            } catch(e) {
                console.error('Switch Session Error:', e);
            }
        }

        async function loadConfig() {
            try {
                const res = await fetch('/api/config');
                const data = await res.json();
                document.getElementById('cfg-textarea').value = JSON.stringify(data, null, 2);
            } catch(e) {}
        }

        async function saveConfig() {
            try {
                const raw = document.getElementById('cfg-textarea').value;
                const parsed = JSON.parse(raw);
                const res = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(parsed)
                });
                const data = await res.json();
                if (data.status === 'saved') alert('✅ Configuration saved!');
            } catch(e) { alert('⚠️ Invalid JSON'); }
        }

        async function deleteSession(sessId) {
            try {
                const res = await fetch('/api/sessions/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessId })
                });
                const data = await res.json();
                if (data.active_session) {
                    activeSessionId = data.active_session;
                    userJustSentPrompt = true;
                }
                fetchStatus();
                fetchChatHistory();
            } catch(e) {
                console.error('Delete Session Error:', e);
            }
        }

        async function fetchStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                document.getElementById('hdr-session-id').innerText = data.active_session;
                activeSessionId = data.active_session;

                const sidebarList = document.getElementById('sidebar-sessions');
                let sideHtml = '';
                if (data.sessions) {
                    data.sessions.forEach(s => {
                        const activeCls = s.id === activeSessionId ? 'active' : '';
                        sideHtml += '<div class="session-item ' + activeCls + '" data-session="' + escapeHtml(s.id) + '">';
                        sideHtml += '<span class="session-item-name">💬 ' + escapeHtml(s.id) + '</span>';
                        sideHtml += '<button class="delete-session-btn" data-delete-session="' + escapeHtml(s.id) + '" title="Borrar sesión">🗑️</button>';
                        sideHtml += '</div>';
                    });
                }
                sidebarList.innerHTML = sideHtml;

                const pillSelect = document.getElementById('sel-provider-pill');
                let pillHtml = '';
                if (data.providers) {
                    Object.keys(data.providers).forEach(key => {
                        const p = data.providers[key];
                        const sel = key === data.active_provider ? 'selected' : '';
                        pillHtml += '<option value="' + key + '" ' + sel + '>🤖 ' + escapeHtml(p.name || key) + '</option>';
                    });
                }
                pillSelect.innerHTML = pillHtml;

                const graphBox = document.getElementById('graph-content');
                const deps = data.dependencies || {};
                let gHtml = '';
                Object.keys(deps).forEach(file => {
                    gHtml += '<div class="module-card">';
                    gHtml += '<div class="module-title">📄 ' + escapeHtml(file) + '</div>';
                    if (deps[file].length > 0) {
                        deps[file].forEach(imp => {
                            gHtml += '<span class="module-pill">➡️ ' + escapeHtml(imp) + '</span>';
                        });
                    } else {
                        gHtml += '<div style="font-size:0.8rem; color:var(--text-secondary);">Standalone module</div>';
                    }
                    gHtml += '</div>';
                });
                graphBox.innerHTML = gHtml;
            } catch(e) {
                console.error('Status Fetch Error:', e);
            }
        }

        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('.tool-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const view = btn.getAttribute('data-view');
                    if (view) switchView(view, btn);
                });
            });

            document.getElementById('send-btn').addEventListener('click', sendMessage);

            document.getElementById('chat-textarea').addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            document.getElementById('new-chat-btn').addEventListener('click', createNewSession);
            document.getElementById('btn-cfg-reload').addEventListener('click', loadConfig);
            document.getElementById('btn-cfg-save').addEventListener('click', saveConfig);

            document.getElementById('sidebar-sessions').addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.delete-session-btn');
                if (deleteBtn && deleteBtn.dataset.deleteSession) {
                    e.stopPropagation();
                    const sessId = deleteBtn.dataset.deleteSession;
                    if (confirm('¿Estás seguro de que deseas borrar la sesión "' + sessId + '"?')) {
                        deleteSession(sessId);
                    }
                    return;
                }
                const item = e.target.closest('.session-item');
                if (item && item.dataset.session) {
                    switchSession(item.dataset.session);
                }
            });

            fetchStatus();
            fetchChatHistory();
            setInterval(fetchChatHistory, 2000);
        });
    </script>
</body>
</html>`);
        });

        server.listen(port, () => {
            console.log(`🌐 [Web Dashboard] QualexDev Dashboard running at http://localhost:${port}`);
        });
        return server;
    }
}

async function executeTask(userPrompt, options, targetDir, fileConfig, activeSessionId = 'default', overrideProviderKey = null) {
    let rawPrompt = userPrompt;
    let selectedProviderKey = overrideProviderKey || fileConfig.active_provider || 'local';

    const providerMatch = rawPrompt.match(/^@([a-zA-Z0-9_-]+)\s+(.*)/);
    if (providerMatch) {
        selectedProviderKey = providerMatch[1];
        rawPrompt = providerMatch[2];
    }

    const providers = fileConfig.ai_providers || {};
    const providerConfig = providers[selectedProviderKey] || providers['local'] || {
        type: 'llama.cpp',
        endpoint: options.endpoint,
        model: options.model,
        max_tokens: options.max_tokens,
        timeout_seconds: options.timeout
    };

    const intent = IntentDetector.classify(rawPrompt);

    console.log(`\n-------------------------------------------------------`);
    console.log(`🚀 EXECUTING: "${rawPrompt}"`);
    console.log(`🎯 Intent Detected: [${intent.mode}] (${intent.reason})`);
    console.log(`🤖 AI Provider Selected: [${selectedProviderKey}] (${providerConfig.name || providerConfig.type})`);
    console.log(`🏷️ Active Session: [${activeSessionId}]`);
    console.log(`-------------------------------------------------------`);

    SessionManager.addPendingPrompt(targetDir, activeSessionId, rawPrompt, selectedProviderKey);

    console.log(`[1/5] 📄 Inspecting file syntax & mapping dependency graph...`);
    const syntaxResults = SyntaxChecker.validate(targetDir);
    const structureFiles = SurgicalCodeSearch.extractProjectStructure(targetDir);
    const depGraph = DependencyMapper.mapProjectDependencies(targetDir);
    console.log(`     Files checked: ${syntaxResults.filesChecked} | Structure: ${structureFiles.length} files indexed | Dependencies: ${Object.keys(depGraph).length} modules linked`);

    const detector = new StackDetector(targetDir);
    const stackInfo = detector.detect(options.custom_test_command);

    console.log(`[2/5] ❓ Formulating self-questioning matrix & symbol search...`);
    const questionsData = QuestionFormulator.generate(rawPrompt, stackInfo);
    
    let codeContext = `Files in project:\n- ${structureFiles.join('\n- ')}\n`;
    codeContext += SessionManager.getSessionHistoryContext(targetDir, activeSessionId);

    codeContext += `\nModule Dependency Relationships:\n`;
    Object.keys(depGraph).forEach(file => {
        if (depGraph[file].length > 0) {
            codeContext += `- ${file} depends on: [ ${depGraph[file].join(', ')} ]\n`;
        }
    });

    if (intent.mode === 'TASK') {
        const words = rawPrompt.split(/\s+/).filter(w => w.length > 3);
        words.forEach(word => {
            const found = SurgicalCodeSearch.searchSymbols(targetDir, word);
            if (found.length > 0) {
                codeContext += `\n🔍 Surgical Symbol Search Match for '${word}':\n`;
                found.forEach(item => {
                    codeContext += `File: ${item.file} (Line ${item.line}):\n${item.snippet}\n`;
                });
            }
        });
    }

    let testResults = { executed: false, passed: true, output: 'Skipped for conversational prompt' };
    if (intent.mode === 'TASK') {
        console.log(`[3/5] 🧪 Running automated test suite & inspecting console logs...`);
        const runner = new TestRunner(targetDir);
        testResults = runner.run(stackInfo.test_command, options.timeout);
        console.log(`     Test Suite: ${testResults.executed ? (testResults.passed ? '✅ PASSED' : '❌ FAILED') : '⚪ SKIPPED'}`);
    } else {
        console.log(`[3/5] 💬 Conversational Mode: Skipping heavy test suite execution.`);
    }

    console.log(`[4/5] 🦙 Ingesting skill rules (.agents/skills/quality-driven-dev/SKILL.md) & connecting to AI...`);
    const skillInstructions = ConfigLoader.loadSkillPrompt(targetDir);
    const detectedModel = await MultiAIClient.detectActiveModel(providerConfig);
    console.log(`     Provider Model: ${detectedModel} (Max Output Tokens: ${providerConfig.max_tokens || 8192})`);
    
    let aiResponseText = null;
    let aiWarningText = null;

    try {
        aiResponseText = await MultiAIClient.query(providerConfig, rawPrompt, skillInstructions, codeContext);
        console.log(`\n--- 🤖 QUALEXDEV AI RESPONSE [${selectedProviderKey}] ---\n${aiResponseText}\n--------------------------------------`);
    } catch (e) {
        aiWarningText = e.message;
        console.log(`⚠️ AI Provider Warning (${selectedProviderKey}): ${e.message}`);
    }

    console.log(`[5/5] 📝 Logging history and state to ${options.log_file}...`);
    const suggestions = ImprovementAnalyzer.analyze(targetDir, stackInfo, testResults, syntaxResults);

    const report = {
        version: VERSION,
        directory: targetDir,
        prompt: rawPrompt,
        active_session: activeSessionId,
        ai_provider_key: selectedProviderKey,
        ai_provider: providerConfig.name || selectedProviderKey,
        configured_model: providerConfig.model,
        detected_model: detectedModel,
        config_file_used: fileConfig.config_file_used || 'qualex_config.json',
        max_tokens: providerConfig.max_tokens || 8192,
        timeout: providerConfig.timeout_seconds || options.timeout,
        max_log_size_kb: fileConfig.logging.max_log_size_kb || 250,
        max_recent_entries: fileConfig.logging.max_recent_entries || 10,
        ai_response: aiResponseText,
        ai_warning: aiWarningText,
        stack_info: stackInfo,
        structure_files: structureFiles,
        dependency_graph: depGraph,
        questions: questionsData.questions,
        syntax_results: syntaxResults,
        test_results: testResults,
        improvement_suggestions: suggestions
    };

    SessionManager.updateSessionPromptReport(targetDir, activeSessionId, rawPrompt, report);
    const logPath = LogWriter.saveLog(targetDir, report, options.log_file);

    console.log(`=======================================================`);
    console.log(`   ✅ TASK COMPLETED | STATUS: ${syntaxResults.valid && testResults.passed ? 'SYSTEM FUNCTIONAL' : 'CHECK ISSUES'}`);
    console.log(`=======================================================\n`);
}

async function startInteractiveShell(options, targetDir, fileConfig, enableUi = false, initialSession = 'default') {
    let currentSessionId = SessionManager.createSession(targetDir, initialSession);

    if (enableUi) {
        DashboardServer.activeSessionId = currentSessionId;
        DashboardServer.start(targetDir, options, fileConfig, 3000);
    }

    const stackInfo = new StackDetector(targetDir).detect();
    const providers = fileConfig.ai_providers || {};
    const providerKeys = Object.keys(providers);
    const dispatchHelp = providerKeys.map(k => `'@${k} my task'`).join(', ');

    console.log(`
===================================================================
    🖥️  QUALEXDEV INTERACTIVE MULTI-AI TERMINAL v${VERSION}
===================================================================
📁 Target Workspace : ${path.basename(targetDir)} (${targetDir})
🏷️ Active Session   : ${currentSessionId} (.agents/sessions/${currentSessionId}/)
🤖 Active AI Models : ${providerKeys.join(', ') || 'local'} (Default: ${fileConfig.active_provider || 'local'})
🌐 Dependency Graph : Active (Module Import/Require Mapping Enabled)
⚙️  Config File     : ${fileConfig.config_file_used || 'qualex_config.json'}
📜 Skill Workflow   : .agents/skills/quality-driven-dev/SKILL.md
${enableUi ? '🌐 Web Dashboard    : http://localhost:3000 (ChatGPT Conversational Style UI Active)' : ''}

AI Dispatch Syntax: ${dispatchHelp || "'@local my task'"}
Session Commands  : 'session new [name]', 'session list', 'session switch <name>'
Type 'exit', 'quit', or 'q' to exit the terminal shell.
===================================================================
`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `QualexDev [${currentSessionId}]> `
    });

    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit' || input.toLowerCase() === 'q') {
            console.log('👋 Exiting QualexDev Interactive Shell. Goodbye!');
            rl.close();
            process.exit(0);
        }

        if (input.startsWith('session ')) {
            const parts = input.split(/\s+/);
            const cmd = parts[1];
            if (cmd === 'new') {
                const newName = parts[2] || null;
                currentSessionId = SessionManager.createSession(targetDir, newName);
                DashboardServer.activeSessionId = currentSessionId;
                console.log(`✨ Created & switched to new isolated session: ${currentSessionId}`);
                rl.setPrompt(`QualexDev [${currentSessionId}]> `);
            } else if (cmd === 'list') {
                const sessions = SessionManager.listSessions(targetDir);
                console.log(`\n📋 Available Sessions (${sessions.length}):`);
                sessions.forEach(s => {
                    console.log(` - ${s.id} ${s.id === currentSessionId ? '(Active)' : ''}`);
                });
                console.log('');
            } else if (cmd === 'switch' && parts[2]) {
                currentSessionId = SessionManager.createSession(targetDir, parts[2]);
                DashboardServer.activeSessionId = currentSessionId;
                console.log(`🔄 Switched to session: ${currentSessionId}`);
                rl.setPrompt(`QualexDev [${currentSessionId}]> `);
            } else if ((cmd === 'delete' || cmd === 'rm' || cmd === 'remove') && parts[2]) {
                const targetSession = parts[2];
                SessionManager.deleteSession(targetDir, targetSession);
                console.log(`🗑️ Deleted session: ${targetSession}`);
                if (currentSessionId === targetSession) {
                    const remaining = SessionManager.listSessions(targetDir);
                    currentSessionId = remaining.length > 0 ? remaining[0].id : SessionManager.createSession(targetDir, 'default');
                    DashboardServer.activeSessionId = currentSessionId;
                    console.log(`🔄 Switched active session to: ${currentSessionId}`);
                    rl.setPrompt(`QualexDev [${currentSessionId}]> `);
                }
            }
            rl.prompt();
            return;
        }

        if (input.length > 0) {
            rl.pause();
            try {
                await executeTask(input, options, targetDir, ConfigLoader.loadConfig(targetDir), currentSessionId);
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
    const result = { prompt: null, dir: '.', questions: false, json: false, config: null, interactive: false, ui: false, session: 'default', provider: null };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--prompt' && args[i + 1]) result.prompt = args[++i];
        if (args[i] === '--dir' && args[i + 1]) result.dir = args[++i];
        if (args[i] === '--provider' && args[i + 1]) result.provider = args[++i];
        if (args[i] === '--session' || args[i] === '--new-session') {
            if (args[i + 1] && !args[i + 1].startsWith('-')) {
                result.session = args[++i];
            } else {
                result.session = `session_${Date.now()}`;
            }
        }
        if (args[i] === '--questions') result.questions = true;
        if (args[i] === '--json') result.json = true;
        if (args[i] === '--config' && args[i + 1]) result.config = args[++i];
        if (args[i] === '--endpoint' && args[i + 1]) result.endpoint = args[++i];
        if (args[i] === '--model' && args[i + 1]) result.model = args[++i];
        if (args[i] === '--interactive' || args[i] === '-i') result.interactive = true;
        if (args[i] === '--ui' || args[i] === '--dashboard') result.ui = true;
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

    SkillInstaller.ensureSkillAndConfig(targetDir);
    const fileConfig = ConfigLoader.loadConfig(targetDir, cliOptions.config);

    const options = {
        prompt: cliOptions.prompt,
        endpoint: cliOptions.endpoint || fileConfig.ai_providers?.local?.endpoint || 'http://127.0.0.1:8080',
        model: cliOptions.model || fileConfig.ai_providers?.local?.model || 'local-model',
        timeout: cliOptions.timeout !== undefined ? cliOptions.timeout : 60,
        max_tokens: fileConfig.ai_providers?.local?.max_tokens || 8192,
        log_file: fileConfig.logging.log_file || 'QUALEX_LOG.md',
        custom_test_command: fileConfig.testing.custom_test_command
    };

    const session_id = cliOptions.session ? cliOptions.session : "default";

    if (!cliOptions.prompt || cliOptions.interactive) {
        await startInteractiveShell(options, targetDir, fileConfig, cliOptions.ui, session_id);
    } else {
        if (cliOptions.ui) {
            DashboardServer.activeSessionId = session_id;
            DashboardServer.start(targetDir, options, fileConfig, 3000);
        }
        await executeTask(cliOptions.prompt, options, targetDir, fileConfig, session_id, cliOptions.provider);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    VERSION,
    SessionManager,
    SkillInstaller,
    ConfigLoader,
    DependencyMapper,
    LogCompactor,
    SurgicalCodeSearch,
    MultiAIClient,
    LogWriter,
    SyntaxChecker,
    StackDetector,
    QuestionFormulator,
    TestRunner,
    ImprovementAnalyzer,
    IntentDetector,
    DashboardServer,
    executeTask
};
