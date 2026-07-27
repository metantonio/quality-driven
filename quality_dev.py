#!/usr/bin/env python3
"""
QualexDev CLI v3.2.0 - Interactive Web Prompt & Execution Edition
Quality-Driven Autonomous Development & Verification System.

Allows global CLI execution or direct Python execution:
    - Auto-copies qualex_config.json & .agents/skills/quality-driven-dev/SKILL.md if missing.
    - Web Dashboard & Interactive Web Prompt: python quality_dev.py --ui (runs at http://localhost:3000)
"""

import os
import sys
import json
import ast
import urllib.request
import urllib.parse
import subprocess
import argparse
import re
import http.server
import socketserver
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

VERSION = "3.2.0"
SYSTEM_SKILL_NAME = "quality-driven-dev"

class SkillInstaller:
    @staticmethod
    def ensure_skill_and_config(root_dir: Path):
        config_path = root_dir / "qualex_config.json"
        if not config_path.exists():
            default_config = {
                "$schema": "https://json.schemastore.org/json",
                "name": "QualexDev Configuration",
                "version": VERSION,
                "ai_provider": "llama.cpp",
                "local_ai": {
                    "endpoint": "http://127.0.0.1:8080",
                    "model": "Ternary-Bonsai-27B-Q2_0.gguf",
                    "timeout_seconds": 3600,
                    "max_tokens": 8192,
                    "temperature": 0.7
                },
                "testing": {
                    "auto_detect_stack": True,
                    "custom_test_command": None,
                    "timeout_seconds": 120
                },
                "logging": {
                    "log_file": "QUALEX_LOG.md",
                    "auto_append": True,
                    "max_log_size_kb": 250,
                    "max_recent_entries": 10
                }
            }
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(default_config, f, indent=2)
            print(f"✨ [QualexDev] Created qualex_config.json in {root_dir}")

        skill_dir = root_dir / ".agents" / "skills" / SYSTEM_SKILL_NAME
        skill_file_path = skill_dir / "SKILL.md"

        if not skill_file_path.exists():
            skill_dir.mkdir(parents=True, exist_ok=True)
            skill_content = """---
name: quality-driven-dev
description: Workflow autónomo de desarrollo orientado a la calidad. Formula preguntas críticas, genera código y tests de calidad en cualquier lenguaje, apoya el diagnóstico con git diff y QUALEX_LOG.md en caso de errores persistentes, y verifica la funcionalidad del proyecto.
---

# Workflow Autónomo QualexDev (Desarrollo Orientado a Calidad y Verificación)

## 📋 Las 5 Fases Obligatorias
### Fase 1: Auto-Interrogación y Planteamiento de Preguntas Clave
### Fase 2: Desarrollo de la Mejora + Pruebas Automatizadas
### Fase 3: Ejecución de Tests, Inspección de git diff y Auto-Corrección
### Fase 4: Verificación Visual & UI (Si aplica)
### Fase 5: Entrega del Trabajo y Registro en QUALEX_LOG.md
"""
            with open(skill_file_path, "w", encoding="utf-8") as f:
                f.write(skill_content)
            print(f"✨ [QualexDev] Initialized Skill (.agents/skills/{SYSTEM_SKILL_NAME}/SKILL.md) in {root_dir}")


class ConfigLoader:
    @staticmethod
    def load_config(root_dir: Path, config_path_override: Optional[str] = None) -> Dict[str, Any]:
        default_config = {
            "ai_provider": "llama.cpp",
            "local_ai": {
                "endpoint": "http://127.0.0.1:8080",
                "model": "local-model",
                "timeout_seconds": 3600,
                "max_tokens": 8192,
                "temperature": 0.7
            },
            "testing": {
                "auto_detect_stack": True,
                "custom_test_command": None,
                "timeout_seconds": 120
            },
            "logging": {
                "log_file": "QUALEX_LOG.md",
                "auto_append": True,
                "max_log_size_kb": 250,
                "max_recent_entries": 10
            }
        }
        
        target_file = Path(config_path_override).resolve() if config_path_override else root_dir / "qualex_config.json"
        if not target_file.exists() and not config_path_override:
            fallback_file = root_dir / "quality_config.json"
            if fallback_file.exists():
                target_file = fallback_file
        
        if target_file.exists():
            try:
                with open(target_file, "r", encoding="utf-8") as f:
                    user_config = json.load(f)
                    default_config["ai_provider"] = user_config.get("ai_provider", default_config["ai_provider"])
                    default_config["local_ai"].update(user_config.get("local_ai", {}))
                    default_config["testing"].update(user_config.get("testing", {}))
                    default_config["logging"].update(user_config.get("logging", {}))
                    default_config["config_file_used"] = target_file.name
            except Exception as e:
                print(f"⚠️ Error reading {target_file}: {str(e)}", file=sys.stderr)
                
        return default_config

    @staticmethod
    def load_skill_prompt(root_dir: Path) -> str:
        skill_path = root_dir / ".agents" / "skills" / SYSTEM_SKILL_NAME / "SKILL.md"
        if skill_path.exists():
            try:
                with open(skill_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                pass
        return "Follow a strict 5-phase quality-driven development workflow with surgical code inspection."


class DependencyMapper:
    @staticmethod
    def map_project_dependencies(root_dir: Path) -> Dict[str, List[str]]:
        graph = {}
        ignore_dirs = {"node_modules", ".git", "__pycache__", ".pytest_cache", "dist", "build", "venv"}
        import_pattern = re.compile(r"(?:import\s+.*?from\s+['\"](.*?)['\"]|require\s*\(\s*['\"](.*?)['\"]\s*\)|from\s+([^\s]+)\s+import)", re.IGNORECASE)
        
        for current_root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            for file_name in files:
                file_path = Path(current_root) / file_name
                ext = file_path.suffix.lower()
                if ext in [".js", ".ts", ".py", ".jsx", ".tsx", ".json"]:
                    rel_path = str(file_path.relative_to(root_dir))
                    graph[rel_path] = []
                    try:
                        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                            content = f.read()
                            matches = import_pattern.findall(content)
                            for match in matches:
                                target_import = match[0] or match[1] or match[2]
                                if target_import and not target_import.startswith("node:") and "http" not in target_import:
                                    graph[rel_path].append(target_import)
                    except Exception:
                        pass
        return graph


class LogCompactor:
    @staticmethod
    def compact_if_needed(root_dir: Path, log_file_name: str = "QUALEX_LOG.md", max_kb: int = 250, max_recent_entries: int = 10) -> bool:
        log_path = root_dir / log_file_name
        if not log_path.exists():
            return False
            
        try:
            file_size_kb = log_path.stat().st_size / 1024
            if file_size_kb < max_kb:
                return False
                
            print(f"🧹 [LogCompactor] Compacting {log_file_name} ({file_size_kb:.1f} KB > {max_kb} KB)...")
            
            with open(log_path, "r", encoding="utf-8") as f:
                content = f.read()
                
            entries = re.split(r"^## 📅 ", content, flags=re.MULTILINE)
            if len(entries) <= max_recent_entries + 1:
                return False
                
            header = entries[0].strip()
            old_entries = entries[1:len(entries) - max_recent_entries]
            recent_entries = entries[len(entries) - max_recent_entries:]
            
            compacted_summary = f"\n### 📜 Archived & Compacted Logs Summary ({len(old_entries)} entries consolidated)\n"
            for entry in old_entries:
                first_line = entry.splitlines()[0] if entry.splitlines() else ""
                task_match = re.search(r"- \*\*Task / Prompt\*\*: (.*)", entry)
                task_text = task_match.group(1) if task_match else "Task execution"
                compacted_summary += f"- [{first_line.strip()}] Task: {task_text}\n"
            compacted_summary += "\n---\n"
            
            new_content = f"{header}\n{compacted_summary}\n" + "".join([f"## 📅 {e}" for e in recent_entries])
            with open(log_path, "w", encoding="utf-8") as f:
                f.write(new_content)
                
            print(f"✅ [LogCompactor] {log_file_name} compacted successfully. Kept {max_recent_entries} recent entries.")
            return True
        except Exception as e:
            print(f"⚠️ [LogCompactor] Error compacting log: {str(e)}", file=sys.stderr)
            return False


class SurgicalCodeSearch:
    @staticmethod
    def search_symbols(root_dir: Path, symbol_query: str) -> List[Dict[str, Any]]:
        symbols_found = []
        ignore_dirs = {"node_modules", ".git", "__pycache__", ".pytest_cache", "dist", "build", "venv"}
        pattern = re.compile(rf"(def\s+{symbol_query}|class\s+{symbol_query}|function\s+{symbol_query}|const\s+{symbol_query}\s*=)", re.IGNORECASE)
        
        for current_root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            for file_name in files:
                file_path = Path(current_root) / file_name
                ext = file_path.suffix.lower()
                if ext in [".py", ".js", ".ts", ".jsx", ".tsx"]:
                    try:
                        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                            lines = f.readlines()
                            for idx, line in enumerate(lines):
                                if pattern.search(line):
                                    snippet_lines = lines[max(0, idx - 2):min(len(lines), idx + 15)]
                                    symbols_found.append({
                                        "file": str(file_path.relative_to(root_dir)),
                                        "line": idx + 1,
                                        "snippet": "".join(snippet_lines)
                                    })
                    except Exception:
                        pass
        return symbols_found

    @staticmethod
    def extract_project_structure(root_dir: Path) -> List[str]:
        files_list = []
        ignore_dirs = {"node_modules", ".git", "__pycache__", ".pytest_cache", "dist", "build", "venv"}
        
        for current_root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            for file_name in files:
                rel_path = Path(current_root).relative_to(root_dir) / file_name
                files_list.append(str(rel_path))
                
        return files_list[:30]


class LocalAIClient:
    @staticmethod
    def detect_active_model(endpoint: str) -> Optional[str]:
        try:
            url = f"{endpoint.rstrip('/')}/v1/models"
            req = urllib.request.Request(url, headers={"User-Agent": "QualexDev/3.2.0"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if "data" in data and len(data["data"]) > 0:
                    return data["data"][0].get("id")
        except Exception:
            try:
                url = f"{endpoint.rstrip('/')}/props"
                req = urllib.request.Request(url, headers={"User-Agent": "QualexDev/3.2.0"})
                with urllib.request.urlopen(req, timeout=3) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    return data.get("default_generation_settings", {}).get("model")
            except Exception:
                pass
        return None

    @staticmethod
    def query(prompt: str, skill_instructions: str, code_context: str, endpoint: str = "http://127.0.0.1:8080", model: str = "local-model", timeout_seconds: int = 3600, max_tokens: int = 8192) -> str:
        full_prompt = f"System Instructions (QualexDev Skill):\n{skill_instructions}\n\nProject Structure & Code Context:\n{code_context}\n\nTask Prompt: {prompt}"
        
        payloads = [
            ("/completion", json.dumps({"prompt": full_prompt, "n_predict": max_tokens}).encode("utf-8")),
            ("/v1/chat/completions", json.dumps({"model": model, "messages": [{"role": "system", "content": skill_instructions}, {"role": "user", "content": f"{code_context}\n\n{prompt}"}], "max_tokens": max_tokens}).encode("utf-8")),
            ("/api/generate", json.dumps({"model": model, "prompt": full_prompt, "stream": False, "options": {"num_predict": max_tokens}}).encode("utf-8"))
        ]
        
        base_url = endpoint.rstrip('/')
        for path_str, body_bytes in payloads:
            try:
                req_url = f"{base_url}{path_str}"
                req = urllib.request.Request(req_url, data=body_bytes, headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                    raw_resp = resp.read().decode("utf-8")
                    data = json.loads(raw_resp)
                    text = data.get("content") or data.get("response")
                    if not text and "choices" in data:
                        text = data["choices"][0].get("message", {}).get("content")
                    text = text or raw_resp
                    text = re.sub(r"<think>[\s\S]*?</think>", "", text).strip()
                    if text:
                        return text
            except Exception:
                continue
                
        raise RuntimeError(f"Could not obtain response from local AI server at {endpoint}")


class LogWriter:
    @staticmethod
    def save_log(root_dir: Path, report: Dict[str, Any], log_file_name: str = "QUALEX_LOG.md") -> Optional[Path]:
        log_file_path = root_dir / log_file_name
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        syntax_valid = report.get("syntax_results", {}).get("valid", False)
        test_passed = report.get("test_results", {}).get("passed", False)
        
        status_icon = "✅ SYSTEM FUNCTIONAL" if (syntax_valid and test_passed) else "❌ ERRORS DETECTED"
        
        entry = f"\n## 📅 Log Entry [{timestamp}] - {status_icon}\n\n"
        entry += f"- **Task / Prompt**: {report.get('prompt')}\n"
        entry += f"- **Tech Stack**: {', '.join(report.get('stack_info', {}).get('languages', [])) or 'Not detected'}\n"
        entry += f"- **AI Provider**: {report.get('ai_provider')}\n"
        entry += f"- **Skill Applied**: `{SYSTEM_SKILL_NAME}` (.agents/skills/{SYSTEM_SKILL_NAME}/SKILL.md)\n"
        entry += f"- **Config File Used**: `{report.get('config_file_used', 'qualex_config.json')}` (Max Tokens: {report.get('max_tokens', 8192)})\n"
        entry += f"- **Dependency Graph**: ✅ Mapped ({len(report.get('dependency_graph', {}))} file nodes linked)\n"
        entry += f"- **Surgical Code Inspection**: ✅ Symbol Search Active ({len(report.get('structure_files', []))} project files indexed)\n"
        if report.get("detected_model") and report.get("detected_model") != report.get("configured_model"):
            entry += f"- **Active Server Model**: `{report.get('detected_model')}` (Configured: `{report.get('configured_model')}`)\n"
        entry += f"- **Syntax & Structure**: {'✅ Valid' if syntax_valid else '❌ Syntax Errors'} ({report.get('syntax_results', {}).get('files_checked', 0)} files checked)\n"
        
        test_res = report.get("test_results", {})
        entry += f"- **Live Test Execution**: {'✅ PASSED' if test_passed else ('❌ FAILED' if test_res.get('executed') else '⚪ Skipped')}\n"
        if test_res.get("command"):
            entry += f"- **Test Command**: `{test_res.get('command')}`\n"
            
        console_summary = test_res.get("console_summary", [])
        if console_summary:
            entry += "\n### 🖥️ Console / Terminal Output:\n```text\n"
            for line in console_summary:
                entry += f"{line}\n"
            entry += "```\n"
            
        entry += "\n### 💡 Prospective Improvements:\n"
        for idx, sug in enumerate(report.get("improvement_suggestions", []), 1):
            entry += f"{idx}. {sug}\n"
            
        entry += "\n---\n"
        
        try:
            if not log_file_path.exists():
                header = "# QUALEX_LOG - QualexDev Verification & Change Log\n\nThis file automatically logs dates, task prompts, test status, and system health after each task.\n\n---\n"
                with open(log_file_path, "w", encoding="utf-8") as f:
                    f.write(header + entry)
            else:
                with open(log_file_path, "a", encoding="utf-8") as f:
                    f.write(entry)
                    
            LogCompactor.compact_if_needed(root_dir, log_file_name, report.get("max_log_size_kb", 250), report.get("max_recent_entries", 10))
            
            return log_file_path
        except Exception:
            return None


class SyntaxChecker:
    @staticmethod
    def validate(root_dir: Path) -> Dict[str, Any]:
        results = {"valid": True, "files_checked": 0, "errors": []}
        ignore_dirs = {"node_modules", ".git", "__pycache__", ".pytest_cache", "dist", "build", "venv"}
        
        for current_root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            for file_name in files:
                file_path = Path(current_root) / file_name
                results["files_checked"] += 1
                ext = file_path.suffix.lower()
                rel_path = file_path.relative_to(root_dir)
                
                if ext == ".json":
                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            json.load(f)
                    except Exception as e:
                        results["valid"] = False
                        results["errors"].append(f"[JSON Syntax Error] {rel_path}: {str(e)}")
                        
                elif ext == ".py":
                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            ast.parse(f.read(), filename=str(file_path))
                    except SyntaxError as e:
                        results["valid"] = False
                        results["errors"].append(f"[Python Syntax Error] {rel_path} (Line {e.lineno}): {e.msg}")
                    except Exception as e:
                        results["valid"] = False
                        results["errors"].append(f"[Python Read Error] {rel_path}: {str(e)}")
                        
        return results


class StackDetector:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        
    def detect(self, custom_test_command: Optional[str] = None) -> Dict[str, Any]:
        info = {"languages": [], "test_runner": None, "test_command": custom_test_command, "has_gui": False, "gui_type": None}
        if custom_test_command:
            info["test_runner"] = "Custom Command"
            
        package_json = self.root_dir / "package.json"
        if package_json.exists():
            info["languages"].append("JavaScript/TypeScript")
            try:
                with open(package_json, "r", encoding="utf-8") as f:
                    pkg_data = json.load(f)
                    scripts = pkg_data.get("scripts", {})
                    deps = {**pkg_data.get("dependencies", {}), **pkg_data.get("devDependencies", {})}
                    if not info["test_command"]:
                        if "test" in scripts:
                            info["test_runner"] = "npm test"
                            info["test_command"] = ["npm", "test"]
                        elif "vitest" in deps:
                            info["test_runner"] = "vitest"
                            info["test_command"] = ["npx", "vitest", "run"]
                        elif "jest" in deps:
                            info["test_runner"] = "jest"
                            info["test_command"] = ["npx", "jest"]
                    if "react" in deps or "vue" in deps or "svelte" in deps or "next" in deps or "vite" in deps:
                        info["has_gui"] = True
                        info["gui_type"] = "Web App (Frontend Framework)"
            except Exception:
                pass
                
        if (self.root_dir / "requirements.txt").exists() or (self.root_dir / "pyproject.toml").exists() or list(self.root_dir.glob("*.py")):
            info["languages"].append("Python")
            if not info["test_command"]:
                info["test_runner"] = "pytest / unittest"
                info["test_command"] = [sys.executable, "-m", "unittest", "discover"]
                
        if (self.root_dir / "index.html").exists() or list(self.root_dir.glob("*.html")):
            if "JavaScript/TypeScript" not in info["languages"]:
                info["languages"].append("HTML/CSS")
            info["has_gui"] = True
            if not info["gui_type"]:
                info["gui_type"] = "Static Web (HTML/CSS)"

        return info


class QuestionFormulator:
    @staticmethod
    def generate(prompt: str, stack_info: Dict[str, Any]) -> Dict[str, Any]:
        languages = ", ".join(stack_info["languages"]) if stack_info["languages"] else "Not detected"
        questions = [
            f"1. [Main Requirement]: How does the proposed solution satisfy the instruction: '{prompt}'?",
            f"2. [Architecture & Stack]: For the {languages} environment, what are the key abstractions and modules?",
            "3. [Edge Cases & Security]: How are null/empty inputs, network timeouts, or unexpected exceptions handled?",
            f"4. [Testing & Console Logs]: Have terminal console logs (stdout/stderr) been inspected to rule out runtime errors?"
        ]
        if stack_info["has_gui"]:
            questions.append(f"5. [GUI / UX Verification]: For {stack_info.get('gui_type')}, is the UI modern, responsive, and aesthetically balanced?")
            questions.append("6. [Browser Console]: Have browser console logs been audited for unhandled JS errors or 404/500 requests?")
        return {"prompt": prompt, "stack": languages, "has_gui": stack_info["has_gui"], "questions": questions}


class TestRunner:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        
    def run(self, test_command: Optional[Any], timeout_seconds: int = 120) -> Dict[str, Any]:
        if not test_command:
            return {"executed": False, "passed": False, "message": "No automated test runner detected in this repository.", "output": "", "console_summary": []}
            
        try:
            cmd_list = test_command if isinstance(test_command, list) else [test_command]
            use_shell = sys.platform == "win32" and cmd_list[0] in ["npm", "npx", "cargo", "go"]
            cmd_str = " ".join(cmd_list)
            
            process = subprocess.run(
                cmd_list if not use_shell else cmd_str,
                cwd=self.root_dir,
                capture_output=True,
                text=True,
                shell=use_shell,
                timeout=timeout_seconds if timeout_seconds > 0 else 3600
            )
            
            passed = process.returncode == 0
            output = (process.stdout or "") + "\n" + (process.stderr or "")
            lines = [l.strip() for l in output.splitlines() if l.strip()]
            
            return {
                "executed": True,
                "passed": passed,
                "return_code": process.returncode,
                "output": output.strip(),
                "command": cmd_str,
                "console_summary": lines[-10:] if passed else [l for l in lines if any(k in l.lower() for k in ["error", "fail", "warning"])]
            }
        except subprocess.TimeoutExpired:
            return {"executed": True, "passed": False, "return_code": -1, "output": f"ERROR: Timeout ({timeout_seconds}s) expired.", "command": str(test_command), "console_summary": ["ERROR: Timeout expired"]}
        except Exception as e:
            return {"executed": False, "passed": False, "return_code": -1, "output": f"Exception: {str(e)}", "command": str(test_command), "console_summary": [str(e)]}


class ImprovementAnalyzer:
    @staticmethod
    def analyze(root_dir: Path, stack_info: Dict[str, Any], test_results: Dict[str, Any], syntax_results: Dict[str, Any]) -> List[str]:
        suggestions = []
        if not (root_dir / "README.md").exists():
            suggestions.append("📝 Add a `README.md` file with project setup, architecture, and usage instructions.")
        if not (root_dir / ".gitignore").exists():
            suggestions.append("🛡️ Add `.gitignore` to prevent committing build artifacts or temporary files.")
        if not syntax_results.get("valid"):
            suggestions.append("⚠️ Resolve detected file syntax and structural errors prior to execution.")
        if not test_results.get("executed"):
            suggestions.append("🧪 Configure an automated testing framework (`jest/vitest` for JS/TS, `pytest` for Python).")
        elif not test_results.get("passed"):
            suggestions.append("⚠️ Review console logs and fix reported terminal test failures.")
        if stack_info.get("has_gui"):
            suggestions.append("🎨 Incorporate visual regression or E2E tests using Playwright/Cypress.")
        suggestions.append("🚀 Setup Continuous Integration (CI/CD) pipelines with GitHub Actions.")
        return suggestions


def execute_task(user_prompt: str, options: Dict[str, Any], target_dir: Path, file_config: Dict[str, Any]):
    print(f"\n-------------------------------------------------------")
    print(f"🚀 EXECUTING TASK: \"{user_prompt}\"")
    print(f"-------------------------------------------------------")

    print(f"[1/5] 📄 Inspecting file syntax & mapping dependency graph...")
    syntax_results = SyntaxChecker.validate(target_dir)
    structure_files = SurgicalCodeSearch.extract_project_structure(target_dir)
    dep_graph = DependencyMapper.map_project_dependencies(target_dir)
    print(f"     Files checked: {syntax_results['files_checked']} | Structure: {len(structure_files)} files indexed | Dependencies: {len(dep_graph)} modules linked")

    detector = StackDetector(target_dir)
    stack_info = detector.detect(options["custom_test_command"])

    print(f"[2/5] ❓ Formulating self-questioning matrix & symbol search...")
    questions_data = QuestionFormulator.generate(user_prompt, stack_info)

    words = [w for w in user_prompt.split() if len(w) > 3]
    code_context = f"Files in project:\n- " + "\n- ".join(structure_files) + "\n"
    
    code_context += "\nModule Dependency Relationships:\n"
    for file_node, deps in dep_graph.items():
        if deps:
            code_context += f"- {file_node} depends on: [ {', '.join(deps)} ]\n"

    for word in words:
        found = SurgicalCodeSearch.search_symbols(target_dir, word)
        if found:
            code_context += f"\n🔍 Surgical Symbol Search Match for '{word}':\n"
            for item in found:
                code_context += f"File: {item['file']} (Line {item['line']}):\n{item['snippet']}\n"

    print(f"[3/5] 🧪 Running automated test suite & inspecting console logs...")
    runner = TestRunner(target_dir)
    test_results = runner.run(stack_info["test_command"], options["timeout"])
    print(f"     Test Suite: {'✅ PASSED' if test_results['passed'] else ('❌ FAILED' if test_results['executed'] else '⚪ SKIPPED')}")

    print(f"[4/5] 🦙 Ingesting skill rules (.agents/skills/{SYSTEM_SKILL_NAME}/SKILL.md) & connecting to AI...")
    skill_instructions = ConfigLoader.load_skill_prompt(target_dir)
    detected_model = LocalAIClient.detect_active_model(options["endpoint"])
    ai_provider = file_config.get("ai_provider", "llama.cpp Server")
    if detected_model:
        print(f"     Active server model: {detected_model} (Max Output Tokens: {options['max_tokens']})")
        
    try:
        response = LocalAIClient.query(user_prompt, skill_instructions, code_context, options["endpoint"], detected_model or options["model"], options["timeout"], options["max_tokens"])
        print(f"\n--- 🤖 QUALEXDEV SKILL AI RESPONSE ---\n{response}\n--------------------------------------")
    except Exception as e:
        print(f"⚠️ Local AI Warning: {str(e)}")

    print(f"[5/5] 📝 Logging history and state to {options['log_file']}...")
    suggestions = ImprovementAnalyzer.analyze(target_dir, stack_info, test_results, syntax_results)

    report = {
        "version": VERSION,
        "directory": str(target_dir),
        "prompt": user_prompt,
        "ai_provider": ai_provider,
        "configured_model": options["model"],
        "detected_model": detected_model,
        "config_file_used": file_config.get("config_file_used", "qualex_config.json"),
        "max_tokens": options["max_tokens"],
        "timeout": options["timeout"],
        "max_log_size_kb": file_config.get("logging", {}).get("max_log_size_kb", 250),
        "max_recent_entries": file_config.get("logging", {}).get("max_recent_entries", 10),
        "stack_info": stack_info,
        "structure_files": structure_files,
        "dependency_graph": dep_graph,
        "questions": questions_data["questions"],
        "syntax_results": syntax_results,
        "test_results": test_results,
        "improvement_suggestions": suggestions
    }

    log_path = LogWriter.save_log(target_dir, report, options["log_file"])

    print(f"=======================================================")
    print(f"   ✅ TASK COMPLETED | STATUS: {'SYSTEM FUNCTIONAL' if (syntax_results['valid'] and test_results['passed']) else 'CHECK ISSUES'}")
    print(f"=======================================================\n")


class PythonDashboardHandler(http.server.BaseHTTPRequestHandler):
    target_dir: Path = Path(".")
    options: Dict[str, Any] = {}
    file_config: Dict[str, Any] = {}

    def do_POST(self):
        if self.path == "/api/execute":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                parsed = json.loads(body)
                user_prompt = parsed.get("prompt")
                if user_prompt and user_prompt.strip():
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "started", "prompt": user_prompt}).encode('utf-8'))
                    
                    # Run execution asynchronously in a background thread
                    t = threading.Thread(target=execute_task, args=(user_prompt, self.options, self.target_dir, self.file_config))
                    t.start()
                else:
                    self.send_response(400)
                    self.end_headers()
            except Exception as e:
                self.send_response(500)
                self.end_headers()

    def do_GET(self):
        if self.path == "/api/status":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            stack_info = StackDetector(self.target_dir).detect()
            dep_graph = DependencyMapper.map_project_dependencies(self.target_dir)
            data = {
                "version": VERSION,
                "project": self.target_dir.name,
                "path": str(self.target_dir),
                "stack": stack_info["languages"],
                "endpoint": self.options["endpoint"],
                "model": self.options["model"],
                "max_tokens": self.options["max_tokens"],
                "modules_count": len(dep_graph),
                "dependencies": dep_graph
            }
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        if self.path == "/api/logs":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            log_path = self.target_dir / self.options["log_file"]
            content = "No logs yet."
            if log_path.exists():
                with open(log_path, "r", encoding="utf-8") as f:
                    content = f.read()
            self.wfile.write(json.dumps({"content": content}).encode('utf-8'))
            return

        # HTML principal del Dashboard Web
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>QualexDev Dashboard v{VERSION}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=Fira+Code:wght@400;600&display=swap" rel="stylesheet">
    <style>
        :root {{
            --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
            --card-bg: rgba(30, 41, 59, 0.7);
            --card-border: rgba(255, 255, 255, 0.1);
            --accent-cyan: #06b6d4;
            --accent-purple: #8b5cf6;
            --accent-green: #10b981;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: 'Inter', sans-serif;
            background: var(--bg-gradient);
            color: var(--text-main);
            min-height: 100vh;
            padding: 2rem;
        }}
        header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 1.5rem;
            border-bottom: 1px solid var(--card-border);
            margin-bottom: 2rem;
        }}
        .title-group {{ display: flex; align-items: center; gap: 1rem; }}
        .logo-badge {{
            background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));
            color: #fff;
            font-weight: 700;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            font-size: 1.1rem;
        }}
        h1 {{ font-size: 1.5rem; font-weight: 600; }}
        .status-pill {{
            background: rgba(16, 185, 129, 0.2);
            color: var(--accent-green);
            border: 1px solid var(--accent-green);
            padding: 0.4rem 0.8rem;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
        }}
        .prompt-card {{
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--card-border);
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }}
        .prompt-input-group {{
            display: flex;
            gap: 1rem;
            margin-top: 0.8rem;
        }}
        input[type="text"] {{
            flex: 1;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid var(--accent-cyan);
            border-radius: 8px;
            padding: 0.8rem 1.2rem;
            color: #fff;
            font-size: 1rem;
            font-family: 'Inter', sans-serif;
            outline: none;
        }}
        button.run-btn {{
            background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));
            color: #fff;
            border: none;
            padding: 0.8rem 1.5rem;
            border-radius: 8px;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }}
        button.run-btn:hover {{
            opacity: 0.9;
            transform: translateY(-1px);
        }}
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }}
        .card {{
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--card-border);
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }}
        .card-title {{
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
            margin-bottom: 0.8rem;
        }}
        .card-value {{
            font-size: 1.2rem;
            font-weight: 600;
            color: var(--accent-cyan);
            word-break: break-all;
        }}
        .graph-container {{
            display: flex;
            flex-direction: column;
            gap: 0.8rem;
            margin-top: 0.5rem;
        }}
        .node-card {{
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(6, 182, 212, 0.3);
            border-radius: 8px;
            padding: 0.8rem 1.2rem;
        }}
        .node-name {{
            font-weight: 600;
            color: var(--accent-cyan);
            margin-bottom: 0.4rem;
            font-family: 'Fira Code', monospace;
        }}
        .dep-pills {{
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }}
        .dep-pill {{
            background: rgba(139, 92, 246, 0.2);
            color: #c084fc;
            border: 1px solid rgba(139, 92, 246, 0.4);
            font-size: 0.78rem;
            padding: 0.2rem 0.6rem;
            border-radius: 12px;
            font-family: 'Fira Code', monospace;
        }}
        .log-box {{
            font-family: 'Fira Code', monospace;
            background: #090d16;
            border: 1px solid var(--card-border);
            border-radius: 8px;
            padding: 1rem;
            max-height: 450px;
            overflow-y: auto;
            white-space: pre-wrap;
            font-size: 0.85rem;
            color: #e2e8f0;
            line-height: 1.5;
        }}
    </style>
</head>
<body>
    <header>
        <div class="title-group">
            <div class="logo-badge">QualexDev v{VERSION} (Python)</div>
            <h1>Dashboard Web Control</h1>
        </div>
        <div class="status-pill">● REPL Shell & Web Interface Ready</div>
    </header>

    <div class="prompt-card">
        <div class="card-title">💬 Interactive Task Prompt Execution</div>
        <div class="prompt-input-group">
            <input type="text" id="task-prompt" placeholder="Enter task prompt (e.g., Verify system health & run unit tests)..." />
            <button class="run-btn" onclick="sendTaskPrompt()">🚀 Run Task</button>
        </div>
    </div>

    <div class="grid">
        <div class="card">
            <div class="card-title">Target Workspace</div>
            <div class="card-value" id="ws-name">Loading...</div>
        </div>
        <div class="card">
            <div class="card-title">Local AI Endpoint</div>
            <div class="card-value" id="ai-endpoint">Loading...</div>
        </div>
        <div class="card">
            <div class="card-title">Max Output Tokens</div>
            <div class="card-value" id="max-tokens">Loading...</div>
        </div>
        <div class="card">
            <div class="card-title">Linked Dependency Modules</div>
            <div class="card-value" id="dep-count">Loading...</div>
        </div>
    </div>

    <div class="card" style="margin-bottom: 2rem;">
        <div class="card-title">🌐 Visual Module Dependency Graph & File Relationships</div>
        <div class="graph-container" id="graph-view">Loading dependency graph matrix...</div>
    </div>

    <div class="card" style="margin-bottom: 2rem;">
        <div class="card-title">📋 Execution History & System Verification Log (QUALEX_LOG.md)</div>
        <div class="log-box" id="log-content">Fetching system verification log...</div>
    </div>

    <script>
        async function sendTaskPrompt() {{
            const promptInput = document.getElementById('task-prompt');
            const promptVal = promptInput.value.trim();
            if (!promptVal) return;

            try {{
                const res = await fetch('/api/execute', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{ prompt: promptVal }})
                }});
                const data = await res.json();
                if (data.status === 'started') {{
                    promptInput.value = '';
                    alert('🚀 Task started! Terminal logs will update below in real-time.');
                    setTimeout(fetchLogs, 1500);
                }}
            }} catch(e) {{
                alert('⚠️ Error starting task: ' + e.message);
            }}
        }}

        async function fetchStatus() {{
            try {{
                const res = await fetch('/api/status');
                const data = await res.json();
                document.getElementById('ws-name').innerText = data.project;
                document.getElementById('ai-endpoint').innerText = data.endpoint;
                document.getElementById('max-tokens').innerText = data.max_tokens + ' tokens';
                document.getElementById('dep-count').innerText = data.modules_count + ' modules linked';

                const graphView = document.getElementById('graph-view');
                const deps = data.dependencies || {{}};
                let html = '';
                
                const files = Object.keys(deps);
                if (files.length === 0) {{
                    html = '<div style="color:var(--text-muted);">No module dependencies detected yet.</div>';
                }} else {{
                    files.forEach(file => {{
                        const imports = deps[file];
                        html += '<div class="node-card">';
                        html += '<div class="node-name">📄 ' + file + '</div>';
                        if (imports && imports.length > 0) {{
                            html += '<div class="dep-pills">';
                            imports.forEach(imp => {{
                                html += '<span class="dep-pill">➡️ ' + imp + '</span>';
                            }});
                            html += '</div>';
                        }} else {{
                            html += '<div style="color:var(--text-muted); font-size:0.8rem;">Standalone module (No imports)</div>';
                        }}
                        html += '</div>';
                    }});
                }}
                graphView.innerHTML = html;
            }} catch(e){{}}
        }}

        async function fetchLogs() {{
            try {{
                const res = await fetch('/api/logs');
                const data = await res.json();
                document.getElementById('log-content').innerText = data.content;
            }} catch(e){{}}
        }}

        fetchStatus();
        fetchLogs();
        setInterval(fetchLogs, 3000);
    </script>
</body>
</html>"""
        self.wfile.write(html.encode('utf-8'))


def start_web_dashboard(target_dir: Path, options: Dict[str, Any], file_config: Dict[str, Any], port: int = 3000):
    PythonDashboardHandler.target_dir = target_dir
    PythonDashboardHandler.options = options
    PythonDashboardHandler.file_config = file_config
    
    server = socketserver.TCPServer(("", port), PythonDashboardHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()
    print(f"🌐 [Web Dashboard] QualexDev Python Dashboard running at http://localhost:{port}")


def start_interactive_shell(options: Dict[str, Any], target_dir: Path, file_config: Dict[str, Any], enable_ui: bool = False):
    if enable_ui:
        start_web_dashboard(target_dir, options, file_config, 3000)

    stack_info = StackDetector(target_dir).detect()
    print(f"""
===================================================================
    🖥️  QUALEXDEV INTERACTIVE REPL TERMINAL v{VERSION}
===================================================================
📁 Target Workspace : {target_dir.name} ({target_dir})
🛠️  Detected Stack   : {', '.join(stack_info['languages']) if stack_info['languages'] else 'Not detected'}
🤖 Local AI Server  : {options['endpoint']}
🌐 Dependency Graph : Active (Module Import/Require Mapping Enabled)
⚙️  Config File     : {file_config.get('config_file_used', 'qualex_config.json')} (Max Output Tokens: {options['max_tokens']})
🧹 Log Auto-Cleaner : Active (Auto-compacts {options['log_file']} at >{file_config.get('logging', {}).get('max_log_size_kb', 250)} KB)
🔍 Code Search      : Surgical Symbol Matching Enabled (Regex/AST)
📜 Skill Workflow   : .agents/skills/{SYSTEM_SKILL_NAME}/SKILL.md
{ '🌐 Web Dashboard    : http://localhost:3000 (Interactive Prompt & Visual Graph Active)' if enable_ui else '' }

Enter your task prompt below to run automated verification.
Type 'exit', 'quit', or 'q' to exit the terminal shell.
===================================================================
""")
    
    while True:
        try:
            user_input = input("QualexDev> ").strip()
            if user_input.lower() in ["exit", "quit", "q"]:
                print("👋 Exiting QualexDev Interactive Shell. Goodbye!")
                sys.exit(0)
            if user_input:
                execute_task(user_input, options, target_dir, file_config)
        except (KeyboardInterrupt, EOFError):
            print("\n👋 Exiting QualexDev Interactive Shell. Goodbye!")
            sys.exit(0)


def main():
    parser = argparse.ArgumentParser(description="QualexDev - Quality-Driven Autonomous Development System")
    parser.add_argument("--prompt", type=str, help="Task prompt")
    parser.add_argument("--dir", type=str, default=".", help="Target project directory")
    parser.add_argument("--config", type=str, help="Path to qualex_config.json")
    parser.add_argument("--interactive", "-i", action="store_true", help="Start QualexDev Interactive Shell")
    parser.add_argument("--ui", "--dashboard", action="store_true", help="Start QualexDev Web Dashboard UI at http://localhost:3000")
    
    args = parser.parse_args()
    target_dir = Path(args.dir).resolve()
    
    if not target_dir.exists():
        print(f"Error: Directory '{target_dir}' does not exist.", file=sys.stderr)
        sys.exit(1)
        
    SkillInstaller.ensure_skill_and_config(target_dir)
    file_config = ConfigLoader.load_config(target_dir, args.config)
    
    options = {
        "prompt": args.prompt,
        "endpoint": file_config["local_ai"]["endpoint"],
        "model": file_config["local_ai"]["model"],
        "timeout": file_config["local_ai"]["timeout_seconds"],
        "max_tokens": file_config["local_ai"].get("max_tokens", 8192),
        "log_file": file_config["logging"]["log_file"],
        "custom_test_command": file_config["testing"]["custom_test_command"]
    }

    if not args.prompt or args.interactive:
        start_interactive_shell(options, target_dir, file_config, args.ui)
    else:
        if args.ui:
            start_web_dashboard(target_dir, options, file_config, 3000)
        execute_task(args.prompt, options, target_dir, file_config)

if __name__ == "__main__":
    main()
