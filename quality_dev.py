#!/usr/bin/env python3
"""
QualityDev CLI v2.0.0 - Interactive Shell & REPL Edition
Sistema Autónomo de Desarrollo Basado en Calidad y Verificación.

Permite ejecutar en modo CLI estándar o en MODO TERMINAL INTERACTIVA (REPL):
    - python quality_dev.py                     (Abre la terminal interactiva)
    - python quality_dev.py --prompt "Mi tarea" (Ejecución directa)
"""

import os
import sys
import json
import ast
import urllib.request
import urllib.parse
import subprocess
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

VERSION = "2.0.0"

class ConfigLoader:
    @staticmethod
    def load_config(root_dir: Path, config_path_override: Optional[str] = None) -> Dict[str, Any]:
        default_config = {
            "ai_provider": "llama.cpp",
            "local_ai": {
                "endpoint": "http://127.0.0.1:8080",
                "model": "local-model",
                "timeout_seconds": 3600
            },
            "testing": {
                "auto_detect_stack": True,
                "custom_test_command": None,
                "timeout_seconds": 120
            },
            "logging": {
                "log_file": "QUALITY_LOG.md",
                "auto_append": True
            }
        }
        
        target_file = Path(config_path_override).resolve() if config_path_override else root_dir / "quality_config.json"
        
        if target_file.exists():
            try:
                with open(target_file, "r", encoding="utf-8") as f:
                    user_config = json.load(f)
                    default_config["ai_provider"] = user_config.get("ai_provider", default_config["ai_provider"])
                    default_config["local_ai"].update(user_config.get("local_ai", {}))
                    default_config["testing"].update(user_config.get("testing", {}))
                    default_config["logging"].update(user_config.get("logging", {}))
            except Exception as e:
                print(f"⚠️ Error al leer {target_file}: {str(e)}", file=sys.stderr)
                
        return default_config


class LocalAIClient:
    @staticmethod
    def detect_active_model(endpoint: str) -> Optional[str]:
        try:
            url = f"{endpoint.rstrip('/')}/v1/models"
            req = urllib.request.Request(url, headers={"User-Agent": "QualityDev/2.0.0"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if "data" in data and len(data["data"]) > 0:
                    return data["data"][0].get("id")
        except Exception:
            try:
                url = f"{endpoint.rstrip('/')}/props"
                req = urllib.request.Request(url, headers={"User-Agent": "QualityDev/2.0.0"})
                with urllib.request.urlopen(req, timeout=3) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    return data.get("default_generation_settings", {}).get("model")
            except Exception:
                pass
        return None

    @staticmethod
    def query(prompt: str, endpoint: str = "http://127.0.0.1:8080", model: str = "local-model", timeout_seconds: int = 3600) -> str:
        payloads = [
            ("/completion", json.dumps({"prompt": prompt, "n_predict": 500}).encode("utf-8")),
            ("/v1/chat/completions", json.dumps({"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": 500}).encode("utf-8")),
            ("/api/generate", json.dumps({"model": model, "prompt": prompt, "stream": False}).encode("utf-8"))
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
                    import re
                    text = re.sub(r"<think>[\s\S]*?</think>", "", text).strip()
                    if text:
                        return text
            except Exception:
                continue
                
        raise RuntimeError(f"No se obtuvo respuesta del servidor de IA local en {endpoint}")


class LogWriter:
    @staticmethod
    def save_log(root_dir: Path, report: Dict[str, Any], log_file_name: str = "QUALITY_LOG.md") -> Optional[Path]:
        log_file_path = root_dir / log_file_name
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        syntax_valid = report.get("syntax_results", {}).get("valid", False)
        test_passed = report.get("test_results", {}).get("passed", False)
        
        status_icon = "✅ SISTEMA FUNCIONAL" if (syntax_valid and test_passed) else "❌ ERRORES DETECTADOS"
        
        entry = f"\n## 📅 Registro [{timestamp}] - {status_icon}\n\n"
        entry += f"- **Tarea / Prompt**: {report.get('prompt')}\n"
        entry += f"- **Stack Tecnológico**: {', '.join(report.get('stack_info', {}).get('languages', [])) or 'No detectado'}\n"
        entry += f"- **Proveedor de IA**: {report.get('ai_provider')}\n"
        if report.get("detected_model") and report.get("detected_model") != report.get("configured_model"):
            entry += f"- **Modelo Detectado en Servidor**: `{report.get('detected_model')}` (Configurado: `{report.get('configured_model')}`)\n"
        entry += f"- **Sintaxis & Estructura**: {'✅ Correcta' if syntax_valid else '❌ Errores detectados'} ({report.get('syntax_results', {}).get('files_checked', 0)} archivos)\n"
        
        test_res = report.get("test_results", {})
        entry += f"- **Ejecución Real & Tests**: {'✅ EXITOSAS' if test_passed else ('❌ FALLIDAS' if test_res.get('executed') else '⚪ No ejecutados')}\n"
        if test_res.get("command"):
            entry += f"- **Comando de Test**: `{test_res.get('command')}`\n"
            
        console_summary = test_res.get("console_summary", [])
        if console_summary:
            entry += "\n### 🖥️ Salida de Consola / Terminal:\n```text\n"
            for line in console_summary:
                entry += f"{line}\n"
            entry += "```\n"
            
        entry += "\n### 💡 Sugerencias de Mejora Pendientes:\n"
        for idx, sug in enumerate(report.get("improvement_suggestions", []), 1):
            entry += f"{idx}. {sug}\n"
            
        entry += "\n---\n"
        
        try:
            if not log_file_path.exists():
                header = "# QUALITY_LOG - Historial de Verificación y Cambios QualityDev\n\nEste archivo registra automáticamente la fecha, cambios y el estado funcional del proyecto tras cada tarea ejecutada.\n\n---\n"
                with open(log_file_path, "w", encoding="utf-8") as f:
                    f.write(header + entry)
            else:
                with open(log_file_path, "a", encoding="utf-8") as f:
                    f.write(entry)
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
                        results["errors"].append(f"[Python Syntax Error] {rel_path} (Línea {e.lineno}): {e.msg}")
                    except Exception as e:
                        results["valid"] = False
                        results["errors"].append(f"[Python Read Error] {rel_path}: {str(e)}")
                        
        return results


class StackDetector:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        
    def detect(self, custom_test_command: Optional[str] = None) -> Dict[str, Any]:
        info = {"languages": [], "test_runner": None, "test_command": custom_test_command, "has_gui": False, "gui_type": None}
        if custom_test_command: info["test_runner"] = "Custom Command"
            
        package_json = self.root_dir / "package.json"
        if package_json.exists():
            info["languages"].append("JavaScript/TypeScript")
            try:
                with open(package_json, "r", encoding="utf-8") as f:
                    pkg_data = json.load(f)
                    scripts = pkg_data.get("scripts", {})
                    deps = {**pkg_data.get("dependencies", {}), **pkg_data.get("devDependencies", {})}
                    if not info["test_command"]:
                        if "test" in scripts: info["test_runner"] = "npm test"; info["test_command"] = ["npm", "test"]
                        elif "vitest" in deps: info["test_runner"] = "vitest"; info["test_command"] = ["npx", "vitest", "run"]
                        elif "jest" in deps: info["test_runner"] = "jest"; info["test_command"] = ["npx", "jest"]
                    if "react" in deps or "vue" in deps or "svelte" in deps or "next" in deps or "vite" in deps:
                        info["has_gui"] = True; info["gui_type"] = "Web App (Frontend Framework)"
            except Exception:
                pass
                
        if (self.root_dir / "requirements.txt").exists() or (self.root_dir / "pyproject.toml").exists() or list(self.root_dir.glob("*.py")):
            info["languages"].append("Python")
            if not info["test_command"]:
                info["test_runner"] = "pytest / unittest"
                info["test_command"] = [sys.executable, "-m", "unittest", "discover"]
                
        if (self.root_dir / "index.html").exists() or list(self.root_dir.glob("*.html")):
            if "JavaScript/TypeScript" not in info["languages"]: info["languages"].append("HTML/CSS")
            info["has_gui"] = True
            if not info["gui_type"]: info["gui_type"] = "Web Estática (HTML/CSS)"

        return info


class QuestionFormulator:
    @staticmethod
    def generate(prompt: str, stack_info: Dict[str, Any]) -> Dict[str, Any]:
        languages = ", ".join(stack_info["languages"]) if stack_info["languages"] else "No detectado"
        questions = [
            f"1. [Requerimiento Principal]: ¿Cómo satisface la solución propuesta la instrucción: '{prompt}'?",
            f"2. [Arquitectura & Stack]: Para el entorno {languages}, ¿cuáles son las abstracciones y módulos principales?",
            "3. [Edge Cases & Seguridad]: ¿Qué ocurre con entradas nulas, vacías, errores de red o excepciones imprevistas?",
            f"4. [Pruebas & Salida de Consola]: ¿Se han inspeccionado los logs de consola (stdout/stderr) para descartar errores en tiempo de ejecución?"
        ]
        if stack_info["has_gui"]:
            questions.append(f"5. [Interfaz Gráfica / UX]: Para {stack_info.get('gui_type')}, ¿la interfaz se ve moderna, es responsive y responde fluidamente?")
            questions.append("6. [Consola del Navegador]: ¿Se han verificado los logs de consola del navegador en busca de errores JS o 404/500?")
        return {"prompt": prompt, "stack": languages, "has_gui": stack_info["has_gui"], "questions": questions}


class TestRunner:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        
    def run(self, test_command: Optional[Any], timeout_seconds: int = 120) -> Dict[str, Any]:
        if not test_command:
            return {"executed": False, "passed": False, "message": "No se detectó un comando de pruebas automático en este repositorio.", "output": "", "console_summary": []}
            
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
            return {"executed": True, "passed": False, "return_code": -1, "output": f"ERROR: Tiempo límite ({timeout_seconds}s) excedido.", "command": str(test_command), "console_summary": ["ERROR: Timeout expired"]}
        except Exception as e:
            return {"executed": False, "passed": False, "return_code": -1, "output": f"Excepción: {str(e)}", "command": str(test_command), "console_summary": [str(e)]}


class ImprovementAnalyzer:
    @staticmethod
    def analyze(root_dir: Path, stack_info: Dict[str, Any], test_results: Dict[str, Any], syntax_results: Dict[str, Any]) -> List[str]:
        suggestions = []
        if not (root_dir / "README.md").exists(): suggestions.append("📝 Agregar un archivo `README.md` con documentación del proyecto.")
        if not (root_dir / ".gitignore").exists(): suggestions.append("🛡️ Añadir `.gitignore` para prevenir temporales.")
        if not syntax_results.get("valid"): suggestions.append("⚠️ Corregir los errores de sintaxis detectados.")
        if not test_results.get("executed"): suggestions.append("🧪 Configurar una suite de pruebas automatizada (`pytest` / `jest`).")
        elif not test_results.get("passed"): suggestions.append("⚠️ Revisar los logs de consola y corregir fallos reportados.")
        if stack_info.get("has_gui"): suggestions.append("🎨 Incorporar pruebas E2E/visuales con Playwright.")
        suggestions.append("🚀 Configurar un pipeline de CI/CD con GitHub Actions.")
        return suggestions


def execute_task(user_prompt: str, options: Dict[str, Any], target_dir: Path, file_config: Dict[str, Any]):
    print(f"\n-------------------------------------------------------")
    print(f"🚀 EJECUTANDO TAREA: \"{user_prompt}\"")
    print(f"-------------------------------------------------------")

    print(f"[1/5] 📄 Inspeccionando sintaxis y estructura de archivos...")
    syntax_results = SyntaxChecker.validate(target_dir)
    print(f"     Archivos inspeccionados: {syntax_results['files_checked']} | Estado: {'✅ CORRECTA' if syntax_results['valid'] else '❌ ERRORES'}")

    detector = StackDetector(target_dir)
    stack_info = detector.detect(options["custom_test_command"])

    print(f"[2/5] ❓ Formulando matriz de auto-preguntas y criterios...")
    questions_data = QuestionFormulator.generate(user_prompt, stack_info)

    print(f"[3/5] 🧪 Ejecutando suite de pruebas automatizadas y logs...")
    runner = TestRunner(target_dir)
    test_results = runner.run(stack_info["test_command"], options["timeout"])
    print(f"     Pruebas: {'✅ PASARON' if test_results['passed'] else ('❌ FALLARON' if test_results['executed'] else '⚪ OMITIDAS')}")

    print(f"[4/5] 🦙 Conectando con servidor de IA local ({options['endpoint']})...")
    detected_model = LocalAIClient.detect_active_model(options["endpoint"])
    ai_provider = file_config.get("ai_provider", "llama.cpp Server")
    if detected_model:
        print(f"     Modelo activo detectado: {detected_model}")
        
    try:
        response = LocalAIClient.query(f"Satisface esta tarea e indica los pasos clave: {user_prompt}", options["endpoint"], detected_model or options["model"], options["timeout"])
        print(f"\n--- 🤖 RESPUESTA DE LA IA LOCAL ---\n{response}\n----------------------------------")
    except Exception as e:
        print(f"⚠️ Advertencia IA: {str(e)}")

    print(f"[5/5] 📝 Registrando historial y estado en {options['log_file']}...")
    suggestions = ImprovementAnalyzer.analyze(target_dir, stack_info, test_results, syntax_results)

    report = {
        "version": VERSION,
        "directory": str(target_dir),
        "prompt": user_prompt,
        "ai_provider": ai_provider,
        "configured_model": options["model"],
        "detected_model": detected_model,
        "timeout": options["timeout"],
        "stack_info": stack_info,
        "questions": questions_data["questions"],
        "syntax_results": syntax_results,
        "test_results": test_results,
        "improvement_suggestions": suggestions
    }

    log_path = LogWriter.save_log(target_dir, report, options["log_file"])

    print(f"=======================================================")
    print(f"   ✅ TAREA FINALIZADA | ESTADO: {'SISTEMA FUNCIONAL' if (syntax_results['valid'] and test_results['passed']) else 'REVISAR FALLOS'}")
    print(f"=======================================================\n")


def start_interactive_shell(options: Dict[str, Any], target_dir: Path, file_config: Dict[str, Any]):
    stack_info = StackDetector(target_dir).detect()
    print(f"""
===================================================================
    🖥️  QUALITYDEV INTERACTIVE REPL TERMINAL v{VERSION}
===================================================================
📁 Proyecto Objetivo : {target_dir.name} ({target_dir})
🛠️  Stack Detectado  : {', '.join(stack_info['languages']) if stack_info['languages'] else 'No detectado'}
🤖 Servidor IA Local : {options['endpoint']}
⚙️  Configuración    : quality_config.json cargado

Escribe tu prompt abajo para ejecutar una tarea con verificación automática.
Escribe 'exit' o 'quit' para salir de la terminal.
===================================================================
""")
    
    while True:
        try:
            user_input = input("QualityDev> ").strip()
            if user_input.lower() in ["exit", "quit", "q"]:
                print("👋 Saliendo de QualityDev. ¡Hasta pronto!")
                sys.exit(0)
            if user_input:
                execute_task(user_input, options, target_dir, file_config)
        except (KeyboardInterrupt, EOFError):
            print("\n👋 Saliendo de QualityDev. ¡Hasta pronto!")
            sys.exit(0)


def main():
    parser = argparse.ArgumentParser(description="QualityDev - Sistema Autónomo de Desarrollo Basado en Calidad")
    parser.add_argument("--prompt", type=str, help="El prompt de la tarea")
    parser.add_argument("--dir", type=str, default=".", help="Ruta al proyecto")
    parser.add_argument("--config", type=str, help="Ruta al archivo quality_config.json")
    parser.add_argument("--interactive", "-i", action="store_true", help="Iniciar terminal interactiva REPL")
    
    args = parser.parse_args()
    target_dir = Path(args.dir).resolve()
    
    if not target_dir.exists():
        print(f"Error: La carpeta '{target_dir}' no existe.", file=sys.stderr)
        sys.exit(1)
        
    file_config = ConfigLoader.load_config(target_dir, args.config)
    
    options = {
        "prompt": args.prompt,
        "endpoint": file_config["local_ai"]["endpoint"],
        "model": file_config["local_ai"]["model"],
        "timeout": file_config["local_ai"]["timeout_seconds"],
        "log_file": file_config["logging"]["log_file"],
        "custom_test_command": file_config["testing"]["custom_test_command"]
    }

    if not args.prompt or args.interactive:
        start_interactive_shell(options, target_dir, file_config)
    else:
        execute_task(args.prompt, options, target_dir, file_config)

if __name__ == "__main__":
    main()
