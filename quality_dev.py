#!/usr/bin/env python3
"""
QualityDev CLI - Sistema Autónomo de Desarrollo Basado en Calidad y Verificación.
Permite analizar tareas, detectar stacks tecnológicos, verificar la sintaxis de archivos,
ejecutar tests automatizados en vivo, inspeccionar los logs de la consola/terminal, y generar un registro histórico en QUALITY_LOG.md.

Uso:
    python quality_dev.py --prompt "Crear un módulo de autenticación con JWT" [--dir /ruta/al/repo]
    python quality_dev.py --test-only [--dir /ruta/al/repo]
    python quality_dev.py --questions --prompt "Prompt de la tarea"
"""

import os
import sys
import json
import ast
import subprocess
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

VERSION = "1.3.0"

class LogWriter:
    """Guarda un registro histórico permanente de los cambios y el estado del sistema en QUALITY_LOG.md"""
    
    @staticmethod
    def save_log(root_dir: Path, report: Dict[str, Any]) -> Optional[Path]:
        log_file_path = root_dir / "QUALITY_LOG.md"
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        syntax_valid = report.get("syntax_results", {}).get("valid", False)
        test_passed = report.get("test_results", {}).get("passed", False)
        
        status_icon = "✅ SISTEMA FUNCIONAL" if (syntax_valid and test_passed) else "❌ ERRORES DETECTADOS"
        
        entry = f"\n## 📅 Registro [{timestamp}] - {status_icon}\n\n"
        entry += f"- **Tarea / Prompt**: {report.get('prompt')}\n"
        entry += f"- **Stack Tecnológico**: {', '.join(report.get('stack_info', {}).get('languages', [])) or 'No detectado'}\n"
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
    """Valida la sintaxis y estructura correcta de archivos JSON, Python, JS, etc."""
    
    @staticmethod
    def validate(root_dir: Path) -> Dict[str, Any]:
        results = {
            "valid": True,
            "files_checked": 0,
            "errors": []
        }
        
        ignore_dirs = {"node_modules", ".git", "__pycache__", ".pytest_cache", "dist", "build", "venv"}
        
        for current_root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            for file_name in files:
                file_path = Path(current_root) / file_name
                results["files_checked"] += 1
                ext = file_path.suffix.lower()
                rel_path = file_path.relative_to(root_dir)
                
                # Validar JSON
                if ext == ".json":
                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            json.load(f)
                    except Exception as e:
                        results["valid"] = False
                        results["errors"].append(f"[JSON Syntax Error] {rel_path}: {str(e)}")
                        
                # Validar Python Syntax via AST
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
    """Detecta el stack tecnológico y los ejecutores de prueba en el directorio objetivo."""
    
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        
    def detect(self) -> Dict[str, Any]:
        info = {
            "languages": [],
            "test_runner": None,
            "test_command": None,
            "has_gui": False,
            "gui_type": None
        }
        
        # Detectar Python
        if (self.root_dir / "requirements.txt").exists() or \
           (self.root_dir / "pyproject.toml").exists() or \
           (self.root_dir / "pytest.ini").exists() or \
           list(self.root_dir.glob("*.py")):
            info["languages"].append("Python")
            if (self.root_dir / "pytest.ini").exists() or (self.root_dir / "conftest.py").exists() or list(self.root_dir.glob("test_*.py")) or list(self.root_dir.glob("tests")):
                info["test_runner"] = "pytest"
                info["test_command"] = ["pytest", "-v"]
            else:
                info["test_runner"] = "unittest"
                info["test_command"] = [sys.executable, "-m", "unittest", "discover"]

        # Detectar JavaScript / TypeScript / Node.js
        package_json = self.root_dir / "package.json"
        if package_json.exists():
            info["languages"].append("JavaScript/TypeScript")
            try:
                with open(package_json, "r", encoding="utf-8") as f:
                    pkg_data = json.load(f)
                    scripts = pkg_data.get("scripts", {})
                    deps = {**pkg_data.get("dependencies", {}), **pkg_data.get("devDependencies", {})}
                    
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
                
        # Detectar HTML/CSS estático
        if (self.root_dir / "index.html").exists() or list(self.root_dir.glob("*.html")):
            if "JavaScript/TypeScript" not in info["languages"]:
                info["languages"].append("HTML/CSS")
            info["has_gui"] = True
            if not info["gui_type"]:
                info["gui_type"] = "Web Estática (HTML/CSS)"

        # Detectar Go
        if (self.root_dir / "go.mod").exists() or list(self.root_dir.glob("*.go")):
            info["languages"].append("Go")
            if not info["test_runner"]:
                info["test_runner"] = "go test"
                info["test_command"] = ["go", "test", "./..."]

        # Detectar Rust
        if (self.root_dir / "Cargo.toml").exists():
            info["languages"].append("Rust")
            if not info["test_runner"]:
                info["test_runner"] = "cargo test"
                info["test_command"] = ["cargo", "test"]

        return info


class QuestionFormulator:
    """Genera la plantilla de auto-interrogación y preguntas clave basadas en la tarea y el stack."""
    
    @staticmethod
    def generate(prompt: str, stack_info: Dict[str, Any]) -> Dict[str, Any]:
        languages = ", ".join(stack_info["languages"]) if stack_info["languages"] else "No detectado"
        has_gui = stack_info["has_gui"]
        
        questions = [
            f"1. [Requerimiento Principal]: ¿Cómo satisface la solución propuesta la instrucción: '{prompt}'?",
            f"2. [Arquitectura & Stack]: Para el entorno {languages}, ¿cuáles son las abstracciones y módulos principales?",
            "3. [Edge Cases & Seguridad]: ¿Qué ocurre con entradas nulas, vacías, errores de red o excepciones imprevistas?",
            f"4. [Pruebas & Salida de Consola]: ¿Se han inspeccionado los logs de consola (stdout/stderr) para descartar errores en tiempo de ejecución?"
        ]
        
        if has_gui:
            questions.append(f"5. [Interfaz Gráfica / UX]: Para {stack_info.get('gui_type')}, ¿la interfaz se ve moderna, es responsive y responde fluidamente?")
            questions.append("6. [Consola del Navegador]: ¿Se han verificado los logs de consola del navegador en busca de errores JS o 404/500?")
            
        return {
            "prompt": prompt,
            "stack": languages,
            "has_gui": has_gui,
            "questions": questions
        }


class TestRunner:
    """Ejecuta los tests del proyecto en vivo e inspecciona las salidas de la consola/terminal."""
    
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        
    def run(self, test_command: Optional[List[str]]) -> Dict[str, Any]:
        if not test_command:
            return {
                "executed": False,
                "passed": False,
                "message": "No se detectó un comando de pruebas automático en este repositorio.",
                "output": "",
                "console_summary": []
            }
            
        try:
            use_shell = sys.platform == "win32" and test_command[0] in ["npm", "npx", "cargo", "go"]
            cmd_str = " ".join(test_command) if isinstance(test_command, list) else test_command
            
            process = subprocess.run(
                test_command if not use_shell else cmd_str,
                cwd=self.root_dir,
                capture_output=True,
                text=True,
                shell=use_shell,
                timeout=120
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
                "console_summary": lines[-10:] if passed else [l for l in lines if any(k in l.lower() for k in ["error", "fail", "warning", "exception"])]
            }
        except subprocess.TimeoutExpired:
            return {
                "executed": True,
                "passed": False,
                "return_code": -1,
                "output": "ERROR: La ejecución de las pruebas excedió el tiempo límite (120s).",
                "command": " ".join(test_command),
                "console_summary": ["ERROR: Timeout expired (120s)"]
            }
        except Exception as e:
            return {
                "executed": False,
                "passed": False,
                "return_code": -1,
                "output": f"Excepción al ejecutar tests: {str(e)}",
                "command": " ".join(test_command),
                "console_summary": [f"Exception: {str(e)}"]
            }


class ImprovementAnalyzer:
    """Analiza el resultado de la sintaxis y tests para sugerir mejoras futuras."""
    
    @staticmethod
    def analyze(root_dir: Path, stack_info: Dict[str, Any], test_results: Dict[str, Any], syntax_results: Dict[str, Any]) -> List[str]:
        suggestions = []
        
        if not (root_dir / "README.md").exists():
            suggestions.append("📝 Agregar un archivo `README.md` con documentación del proyecto, instalación y comandos de uso.")
            
        if not (root_dir / ".gitignore").exists():
            suggestions.append("🛡️ Añadir `.gitignore` para prevenir la inclusión no deseada de temporales o dependencias.")
            
        if not syntax_results.get("valid"):
            suggestions.append("⚠️ Corregir los errores de sintaxis/estructura de archivos detectados antes de ejecutar el proyecto.")

        if not test_results.get("executed"):
            suggestions.append("🧪 Configurar una suite de pruebas automatizada (`pytest` para Python, `jest/vitest` para JS/TS).")
        elif not test_results.get("passed"):
            suggestions.append("⚠️ Revisar los logs de consola y corregir los errores reportados en la terminal.")
            
        if stack_info.get("has_gui"):
            suggestions.append("🎨 Incorporar pruebas de regresión visual o E2E con herramientas como Playwright o Cypress.")
            suggestions.append("♿ Auditar accesibilidad (WCAG) y la consola del navegador en busca de errores JS.")
            
        suggestions.append("🚀 Configurar un pipeline de Integración Continua (CI/CD) como GitHub Actions para ejecutar tests en cada PR.")
        
        return suggestions


def main():
    parser = argparse.ArgumentParser(description="QualityDev - Sistema Autónomo de Desarrollo Basado en Calidad")
    parser.add_argument("--prompt", type=str, help="El prompt o instrucción de la tarea a realizar")
    parser.add_argument("--dir", type=str, default=".", help="Ruta al repositorio o carpeta del proyecto (por defecto: actual)")
    parser.add_argument("--test-only", action="store_true", help="Ejecutar solo el análisis y ejecución de pruebas existentes")
    parser.add_argument("--questions", action="store_true", help="Generar únicamente la matriz de auto-preguntas")
    parser.add_argument("--json", action="store_true", help="Imprimir la salida en formato JSON")
    
    args = parser.parse_args()
    
    target_dir = Path(args.dir).resolve()
    if not target_dir.exists():
        print(f"Error: La carpeta especificada '{target_dir}' no existe.", file=sys.stderr)
        sys.exit(1)
        
    detector = StackDetector(target_dir)
    stack_info = detector.detect()
    
    prompt = args.prompt or "Tarea sin descripción especificada"
    questions_data = QuestionFormulator.generate(prompt, stack_info)
    
    if args.questions:
        if args.json:
            print(json.dumps(questions_data, indent=2, ensure_ascii=False))
        else:
            print("\n=== MATRIZ DE AUTO-PREGUNTAS QUALITYDEV ===")
            print(f"Tarea: {prompt}")
            print(f"Stack Detectado: {questions_data['stack']}")
            print(f"GUI Presente: {'Sí' if questions_data['has_gui'] else 'No'}\n")
            for q in questions_data["questions"]:
                print(q)
        return

    syntax_results = SyntaxChecker.validate(target_dir)
    runner = TestRunner(target_dir)
    test_results = runner.run(stack_info.get("test_command"))
    
    suggestions = ImprovementAnalyzer.analyze(target_dir, stack_info, test_results, syntax_results)
    
    report = {
        "version": VERSION,
        "directory": str(target_dir),
        "prompt": prompt,
        "stack_info": stack_info,
        "questions": questions_data["questions"],
        "syntax_results": syntax_results,
        "test_results": test_results,
        "improvement_suggestions": suggestions
    }
    
    log_path = LogWriter.save_log(target_dir, report)
    
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print("\n=======================================================")
        print("    QUALITYDEV - REPORTE DE EJECUCIÓN Y MEJORA    ")
        print("=======================================================")
        print(f"📁 Proyecto: {target_dir.name} ({target_dir})")
        print(f"🛠️  Stack: {', '.join(stack_info['languages']) if stack_info['languages'] else 'Desconocido'}")
        print(f"🖥️  Interfaz Gráfica: {'Sí (' + str(stack_info['gui_type']) + ')' if stack_info['has_gui'] else 'No'}")
        if log_path:
            print(f"📝 Log Registrado en: {log_path.name}")
        print("-------------------------------------------------------")
        print("📄 VERIFICACIÓN DE SINTAXIS Y ESTRUCTURA DE ARCHIVOS:")
        print(f"  • Archivos inspeccionados: {syntax_results['files_checked']}")
        print(f"  • Sintaxis y Estructura: {'✅ CORRECTA' if syntax_results['valid'] else '❌ ERRORES DETECTADOS'}")
        if not syntax_results["valid"]:
            for err in syntax_results["errors"]:
                print(f"    - {err}")
        print("-------------------------------------------------------")
        print("❓ PREGUNTAS Y PLANTEAMIENTO CRÍTICO:")
        for q in questions_data["questions"]:
            print(f"  • {q}")
        print("-------------------------------------------------------")
        print("🧪 PRUEBAS AUTOMATIZADAS & INSPECCIÓN DE CONSOLA / TERMINAL:")
        if test_results["executed"]:
            status = "✅ EXITOSAS (CONSOLA LIMPIA)" if test_results["passed"] else "❌ FALLIDAS (ERRORES DETECTADOS EN CONSOLA)"
            print(f"  • Comando: {test_results['command']}")
            print(f"  • Estado: {status}")
            if test_results.get("console_summary"):
                print("\n--- RESUMEN DE SALIDA DE CONSOLA / TERMINAL ---")
                for line in test_results["console_summary"]:
                    print(f"  > {line}")
                print("-----------------------------------------------")
        else:
            print(f"  • {test_results['message']}")
        print("-------------------------------------------------------")
        print("💡 SUGERENCIAS DE MEJORA FUTURA:")
        for idx, sug in enumerate(suggestions, 1):
            print(f"  • {sug}")
        print("=======================================================\n")

if __name__ == "__main__":
    main()
