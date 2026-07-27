#!/usr/bin/env python3
"""
QualityDev CLI - Sistema Autónomo de Desarrollo Basado en Calidad y Verificación.
Permite analizar tareas, detectar stacks tecnológicos, ejecutar tests automatizados,
verificar la funcionalidad/UI y generar reportes con sugerencias de mejora.

Uso:
    python quality_dev.py --prompt "Crear un módulo de autenticación con JWT" [--dir /ruta/al/repo]
    python quality_dev.py --test-only [--dir /ruta/al/repo]
    python quality_dev.py --questions "Prompt de la tarea"
"""

import os
import sys
import json
import subprocess
import argparse
from pathlib import Path
from typing import Dict, List, Any, Optional

VERSION = "1.0.0"

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
            "gui_type": None,
            "files_found": []
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
            f"4. [Pruebas Automatizadas]: ¿Qué pruebas unitarias/integrales validarás con '{stack_info.get('test_runner') or 'tests manuales'}'?"
        ]
        
        if has_gui:
            questions.append(f"5. [Interfaz Gráfica / UX]: Para {stack_info.get('gui_type')}, ¿la interfaz se ve moderna, es responsive y responde fluidamente?")
            questions.append("6. [Visual Verification]: ¿Se han verificado capturas de pantalla o renderizado en navegador?")
            
        return {
            "prompt": prompt,
            "stack": languages,
            "has_gui": has_gui,
            "questions": questions
        }


class TestRunner:
    """Ejecuta los tests del proyecto y recopila métricas y logs."""
    
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        
    def run(self, test_command: Optional[List[str]]) -> Dict[str, Any]:
        if not test_command:
            return {
                "executed": False,
                "passed": False,
                "message": "No se detectó un comando de pruebas automático en este repositorio.",
                "output": ""
            }
            
        try:
            # shell=True en Windows si es npm
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
            
            return {
                "executed": True,
                "passed": passed,
                "return_code": process.returncode,
                "output": output.strip(),
                "command": cmd_str
            }
        except subprocess.TimeoutExpired:
            return {
                "executed": True,
                "passed": False,
                "return_code": -1,
                "output": "ERROR: La ejecución de las pruebas excedió el tiempo límite (120s).",
                "command": " ".join(test_command)
            }
        except Exception as e:
            return {
                "executed": False,
                "passed": False,
                "return_code": -1,
                "output": f"Excepción al ejecutar tests: {str(e)}",
                "command": " ".join(test_command)
            }


class ImprovementAnalyzer:
    """Analiza la estructura del proyecto y sugiere mejoras futuras."""
    
    @staticmethod
    def analyze(root_dir: Path, stack_info: Dict[str, Any], test_results: Dict[str, Any]) -> List[str]:
        suggestions = []
        
        # Sugerencias según archivos faltantes
        if not (root_dir / "README.md").exists():
            suggestions.append("📝 Agregar un archivo `README.md` con documentación del proyecto, instalación y comandos de uso.")
            
        if not (root_dir / ".gitignore").exists():
            suggestions.append("🛡️ Añadir `.gitignore` para prevenir la inclusión no deseada de temporales o dependencias.")
            
        if not test_results.get("executed"):
            suggestions.append("🧪 Configurar una suite de pruebas automatizada (`pytest` para Python, `jest/vitest` para JS/TS).")
        elif not test_results.get("passed"):
            suggestions.append("⚠️ Corregir los fallos reportados en la suite de pruebas automatizadas antes de pasar a producción.")
            
        # Sugerencias por lenguaje
        if "Python" in stack_info.get("languages", []):
            if not (root_dir / "requirements.txt").exists() and not (root_dir / "pyproject.toml").exists():
                suggestions.append("📦 Especificar las dependencias del proyecto en `requirements.txt` o `pyproject.toml`.")
            suggestions.append("🐍 Añadir linters y formateadores automáticos como `ruff` o `black` y chequeo de tipos con `mypy`.")
            
        if "JavaScript/TypeScript" in stack_info.get("languages", []):
            if not (root_dir / "tsconfig.json").exists():
                suggestions.append("🔷 Considerar migrar a TypeScript o añadir comprobaciones estrictas con `tsconfig.json`.")
            suggestions.append("⚡ Añadir ESLint y Prettier para garantizar un estilo de código consistente.")
            
        if stack_info.get("has_gui"):
            suggestions.append("🎨 Incorporar pruebas de regresión visual o E2E con herramientas como Playwright o Cypress.")
            suggestions.append("♿ Auditar accesibilidad (WCAG) y contraste de colores en la interfaz gráfica.")
            
        # Sugerencias generales de arquitectura
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

    runner = TestRunner(target_dir)
    test_results = runner.run(stack_info.get("test_command"))
    
    suggestions = ImprovementAnalyzer.analyze(target_dir, stack_info, test_results)
    
    report = {
        "version": VERSION,
        "directory": str(target_dir),
        "prompt": prompt,
        "stack_info": stack_info,
        "questions": questions_data["questions"],
        "test_results": test_results,
        "improvement_suggestions": suggestions
    }
    
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print("\n=======================================================")
        print("    QUALITYDEV - REPORTE DE EJECUCIÓN Y MEJORA    ")
        print("=======================================================")
        print(f"📁 Proyecto: {target_dir.name} ({target_dir})")
        print(f"🛠️  Stack: {', '.join(stack_info['languages']) if stack_info['languages'] else 'Desconocido'}")
        print(f"🖥️  Interfaz Gráfica: {'Sí (' + str(stack_info['gui_type']) + ')' if stack_info['has_gui'] else 'No'}")
        print("-------------------------------------------------------")
        print("❓ PREGUNTAS Y PLANTEAMIENTO CRÍTICO:")
        for q in questions_data["questions"]:
            print(f"  • {q}")
        print("-------------------------------------------------------")
        print("🧪 PRUEBAS AUTOMATIZADAS:")
        if test_results["executed"]:
            status = "✅ EXITOSAS" if test_results["passed"] else "❌ FALLIDAS"
            print(f"  • Comando: {test_results['command']}")
            print(f"  • Estado: {status}")
            if not test_results["passed"]:
                print(f"\n--- SALIDA DE ERRORES ---\n{test_results['output']}\n------------------------")
        else:
            print(f"  • {test_results['message']}")
        print("-------------------------------------------------------")
        print("💡 SUGERENCIAS DE MEJORA FUTURA:")
        for idx, sug in enumerate(suggestions, 1):
            print(f"  {idx}. {sug}")
        print("=======================================================\n")

if __name__ == "__main__":
    main()
