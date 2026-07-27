# QualityDev - Sistema Autónomo de Desarrollo Basado en Calidad y Verificación
# QualityDev - Autonomous Quality-Driven Development System

[Español](#-español) | [English](#-english)

---

## 🌐 Español

**QualityDev** es un sistema universal para desarrollo de software orientado a la calidad y verificación automática. Funciona con **cualquier modelo de IA** —tanto modelos en la nube (Gemini, Claude, GPT-4) como **IAs Locales de Código Abierto (`llama.cpp`, `Ollama`, `vLLM`, `LM Studio`)**— para proyectos desde cero o tareas de mejora sobre código existente.

Ambos ejecutables (**`quality_dev.js`** en Node.js y **`quality_dev.py`** en Python) cargan sus parámetros automáticamente desde el archivo **`quality_config.json`** en la raíz del proyecto. **Ninguno de los dos usa `package.json` para configurar la IA local** (`package.json` se usa exclusivamente para gestionar las dependencias de Node.js).

---

### ⚙️ Configuración de IA Local con `quality_config.json`

Crea o edita el archivo `quality_config.json` en la raíz de cualquier repositorio para definir los parámetros de tu servidor local de IA:

```json
{
  "ai_provider": "llama.cpp",
  "local_ai": {
    "endpoint": "http://127.0.0.1:8080",
    "model": "Ternary-Bonsai-27B-Q2_0.gguf",
    "timeout_seconds": 3600,
    "max_tokens": 1000,
    "temperature": 0.7
  },
  "testing": {
    "auto_detect_stack": true,
    "custom_test_command": null,
    "timeout_seconds": 120
  },
  "logging": {
    "log_file": "QUALITY_LOG.md",
    "auto_append": true
  }
}
```

#### Descripción de Parámetros:
- **`endpoint`**: Dirección URL de tu servidor local (`http://127.0.0.1:8080` para `llama_server`, `http://localhost:11434` para `Ollama`, `http://localhost:8000` para `vLLM`).
- **`model`**: Nombre o archivo `.gguf` del modelo preferido. *(QualityDev detecta automáticamente si `llama_server` tiene otro modelo cargado en memoria RAM/VRAM y te avisará)*.
- **`timeout_seconds`**: Tiempo máximo de espera en segundos para tareas de larga duración (ej. `3600` para 1 hora, o `0` para tiempo ilimitado).
- **`custom_test_command`**: (Opcional) Comando personalizado para ejecutar pruebas si no deseas usar la detección automática.
- **`log_file`**: Nombre del archivo donde se guardará el historial de cambios y estado del sistema (por defecto: `QUALITY_LOG.md`).

---

### 🦙 Ejemplos de Uso (Python y Node.js)

Una vez configurado `quality_config.json`, puedes ejecutar la tarea con cualquier ejecutable sin tener que escribir parámetros largos en la consola:

```bash
# Con Node.js:
node quality_dev.js --prompt "Crear módulo de autenticación con JWT"

# Con Python:
python quality_dev.py --prompt "Crear módulo de autenticación con JWT"

# Probar la comunicación con el servidor de IA local:
node quality_dev.js --prompt "Verificar conexion" --test-llm
```

---

### 🚀 Estructura del Sistema

```text
repository-root/
├── .agents/
│   └── skills/
│       └── quality-driven-dev/
│           └── SKILL.md            # Skill de Agente Universal para IA (Nube o Local)
├── quality_config.json             # Archivo de Configuración Universal de IA y Pruebas
├── quality_dev.py                  # Script ejecutable CLI en Python (lee quality_config.json)
├── quality_dev.js                  # Script ejecutable CLI en Node.js (lee quality_config.json)
├── QUALITY_LOG.md                  # Historial automático de cambios y estado del sistema
└── README.md                       # Guía de uso bilingüe
```

---

## 🌐 English

**QualityDev** is a universal system for quality-driven development and automated verification. Both CLI runners (**`quality_dev.js`** and **`quality_dev.py`**) load local AI settings from **`quality_config.json`**. Neither runner uses `package.json` for AI configuration (`package.json` is strictly for Node.js package management).

### ⚙️ Local AI Configuration via `quality_config.json`

Edit `quality_config.json` in your repository root to configure your local LLM server:

```json
{
  "ai_provider": "llama.cpp",
  "local_ai": {
    "endpoint": "http://127.0.0.1:8080",
    "model": "Ternary-Bonsai-27B-Q2_0.gguf",
    "timeout_seconds": 3600
  }
}
```

```bash
# Run with Node.js:
node quality_dev.js --prompt "Add JWT authentication module"

# Run with Python:
python quality_dev.py --prompt "Add JWT authentication module"
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
