# QualityDev - Sistema Autónomo de Desarrollo Basado en Calidad y Verificación
# QualityDev - Autonomous Quality-Driven Development System

[Español](#-español) | [English](#-english)

---

## 🌐 Español

**QualityDev** es un sistema universal para desarrollo de software orientado a la calidad y verificación automática. Funciona con **cualquier modelo de IA** —tanto modelos en la nube (Gemini, Claude, GPT-4) como **IAs Locales de Código Abierto (`Ollama`, `llama.cpp`, `vLLM`, `LM Studio`, `LocalAI`)**— para proyectos desde cero o tareas de mejora sobre código existente.

Garantiza que cualquier modelo de IA o desarrollador:

1. **Auto-interrogue los requerimientos** y evalúe el impacto en el código existente antes de modificar nada.
2. **Genere código modular** en cualquier lenguaje (Python, JavaScript/TypeScript, Go, Rust, HTML/CSS, etc.).
3. **Cree y ejecute tests de calidad automatizados** garantizando que la nueva mejora pase y no se rompa la funcionalidad anterior (*Anti-regresión*).
4. **Inspeccione la interfaz gráfica (GUI/Web)** cuando aplique, evaluando aspectos estéticos, responsivos y de experiencia de usuario.
5. **Guarde el registro de cambios** en `QUALITY_LOG.md` y entregue sugerencias de mejora al finalizar.

---

### 🦙 Uso con IAs Locales (Ollama, llama.cpp, vLLM, LM Studio)

Puedes conectar QualityDev a tu servidor local de IA en unos segundos:

```bash
# Conectar con Ollama local (ej. DeepSeek-Coder, Qwen2.5-Coder, Llama-3-Coder)
node quality_dev.js --prompt "Crear un módulo de autenticación" --ollama --model deepseek-coder

# Especificar un endpoint personalizado (vLLM, llama.cpp o LM Studio)
node quality_dev.js --prompt "Optimizar consultas" --ollama --model qwen2.5-coder --endpoint http://localhost:8000
```

---

### 🚀 Estructura del Sistema

```text
repository-root/
├── .agents/
│   └── skills/
│       └── quality-driven-dev/
│           └── SKILL.md            # Skill de Agente Universal para IA (Nube o Local)
├── quality_dev.py                  # Script ejecutable CLI en Python
├── quality_dev.js                  # Script ejecutable CLI en Node.js (con cliente Ollama/vLLM)
├── QUALITY_LOG.md                  # Historial automático de cambios y estado del sistema
└── README.md                       # Guía de uso bilingüe
```

---

## 🌐 English

**QualityDev** is a universal system for quality-driven development and automated verification. It works with **any AI provider** —both cloud models (Gemini, Claude, GPT-4) and **Local Open-Source LLMs (`Ollama`, `llama.cpp`, `vLLM`, `LM Studio`, `LocalAI`)**— for new projects from scratch or refactoring existing codebases.

### 🦙 Usage with Local LLMs (Ollama, llama.cpp, vLLM, LM Studio)

```bash
# Connect with local Ollama (e.g. DeepSeek-Coder, Qwen2.5-Coder, Llama-3-Coder)
node quality_dev.js --prompt "Create an authentication module" --ollama --model deepseek-coder

# Specify a custom endpoint (vLLM, llama.cpp or LM Studio)
node quality_dev.js --prompt "Optimize queries" --ollama --model qwen2.5-coder --endpoint http://localhost:8000
```

---

## 🧪 Automatically Supported Tech Stacks / Stacks Soportados

| Language / Environment | Detected Runner | Automatic Command |
| :--- | :--- | :--- |
| **Python** | `pytest` / `unittest` | `pytest -v` or `python -m unittest` |
| **JavaScript / TypeScript** | `npm test` / `vitest` / `jest` | `npm test` or `npx vitest run` |
| **Go** | `go test` | `go test ./...` |
| **Rust** | `cargo test` | `cargo test` |
| **Static Web / Frontend** | Detects HTML/CSS/React/Vue | Enables UI & Accessibility checklist |
