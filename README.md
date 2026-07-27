# QualexDev - Sistema Autónomo de Desarrollo Basado en Calidad y Verificación
# QualexDev - Autonomous Quality-Driven Development System

[Español](#-español) | [English](#-english)

---

## 🌐 Español

**QualexDev v2.5.0** es un sistema universal para desarrollo de software orientado a la calidad y verificación automática. Funciona con **IAs Locales (`llama.cpp`, `Ollama`, `vLLM`, `LM Studio`)** y modelos en la nube.

---

### 🖥️ Modo Terminal Interactiva (REPL)

Inicia la consola interactiva ejecutando `quality_dev.js` o `quality_dev.py` sin argumentos:

```bash
# Con Node.js:
node quality_dev.js

# Con Python:
python quality_dev.py
```

---

### ⚙️ Configuración en `qualex_config.json`

Configura los parámetros de tu servidor local en `qualex_config.json` (archivo independiente de `package.json`):

```json
{
  "ai_provider": "llama.cpp",
  "local_ai": {
    "endpoint": "http://127.0.0.1:8080",
    "model": "Ternary-Bonsai-27B-Q2_0.gguf",
    "timeout_seconds": 3600,
    "max_tokens": 8192,
    "temperature": 0.7
  },
  "testing": {
    "auto_detect_stack": true,
    "custom_test_command": null,
    "timeout_seconds": 120
  },
  "logging": {
    "log_file": "QUALEX_LOG.md",
    "auto_append": true
  }
}
```

#### 📌 Definición de Parámetros:
- **`max_tokens`**: **Es el límite máximo de tokens que le permitimos generar como respuesta al modelo en una sola salida.** *(Independiente del contexto de entrada de 64k-256k del servidor)*.
- **`endpoint`**: Dirección URL del servidor de IA local (`http://127.0.0.1:8080` para `llama_server`).
- **`model`**: Nombre o archivo `.gguf` del modelo.
- **`timeout_seconds`**: Tiempo máximo de espera en segundos para la ejecución de la tarea.
- **`log_file`**: Nombre del archivo de historial y estado del sistema (`QUALEX_LOG.md`).

---

## 🌐 English

**QualexDev v2.5.0** features a dedicated configuration file **`qualex_config.json`** separate from `package.json`.

### ⚙️ Parameters Definition:
- **`max_tokens`**: **This is the maximum token limit set for the model's generated response in a single completion.** *(Separate from the server's 64k-256k input context window)*.
- **`endpoint`**: Local LLM server URL (`http://127.0.0.1:8080`).
- **`model`**: Active model ID or `.gguf` file name.
- **`timeout_seconds`**: Maximum task execution timeout in seconds.
