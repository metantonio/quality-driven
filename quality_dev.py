#!/usr/bin/env python3
"""
QualexDev CLI v2.7.0 - Dependency Graph & REPL Edition
Quality-Driven Autonomous Development & Verification System.
Automatically maps module imports, dependencies, and file relationships across the project.

Run in interactive terminal mode or direct CLI command mode:
    - python quality_dev.py                     (Launches QualexDev Interactive Shell)
    - python quality_dev.py --prompt "My task" (Direct execution)
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
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

VERSION = "2.7.0"

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
        skill_path = root_dir / ".agents" / "skills" / "quality-driven-dev" / "SKILL.md"
        if skill_path.exists():
            try:
                with open(skill_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                pass
        return "Follow a strict 5-phase quality-driven development workflow with surgical code inspection."


class DependencyMapper:
    """Mapea las relaciones e interconexiones de importación/exportación entre los archivos del proyecto."""
    
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
            req = urllib.request.Request(url, headers={"User-Agent": "QualexDev/2.7.0"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if "data" in data and len(data["data"]) > 0:
                    return data["data"][0].get("id")
        except Exception:
            try:
                url = f"{endpoint.rstrip('/')}/props"
                req = urllib.request.Request(url, headers={"User-Agent": "QualexDev/2.7.0"})
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
        entry += f"- **Skill Applied**: `quality-driven-dev` (.agents/skills/quality-driven-dev/SKILL.md)\n"
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

    print(f"[4/5] 🦙 Ingesting skill rules (.agents/skills/quality-driven-dev/SKILL.md) & connecting to AI...")
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


def start_interactive_shell(options: Dict[str, Any], target_dir: Path, file_config: Dict[str, Any]):
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
📜 Skill Workflow   : .agents/skills/quality-driven-dev/SKILL.md

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
    
    args = parser.parse_args()
    target_dir = Path(args.dir).resolve()
    
    if not target_dir.exists():
        print(f"Error: Directory '{target_dir}' does not exist.", file=sys.stderr)
        sys.exit(1)
        
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
        start_interactive_shell(options, target_dir, file_config)
    else:
        execute_task(args.prompt, options, target_dir, file_config)

if __name__ == "__main__":
    main()
