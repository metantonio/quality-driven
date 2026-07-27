# QualityDev - Sistema Autónomo de Desarrollo Basado en Calidad y Verificación
# QualityDev - Autonomous Quality-Driven Development System

[Español](#-español) | [English](#-english)

---

## 🌐 Español

**QualityDev v2.0.0** incluye un **Modo Terminal Interactiva (REPL)**. Ahora puedes iniciar la consola interactiva una sola vez y escribir tus prompts continuamente sin tener que ejecutar comandos con argumentos cada vez.

---

### 🖥️ Modo Terminal Interactiva (REPL)

Para abrir la terminal interactiva, simplemente ejecuta `quality_dev.js` o `quality_dev.py` sin argumentos:

```bash
# Iniciar consola interactiva con Node.js:
node quality_dev.js

# Iniciar consola interactiva con Python:
python quality_dev.py
```

#### 📺 Ejemplo de la Terminal Interactiva en Acción:

```text
===================================================================
    🖥️  QUALITYDEV INTERACTIVE REPL TERMINAL v2.0.0
===================================================================
📁 Proyecto Objetivo : mi-proyecto
🛠️  Stack Detectado  : JavaScript/TypeScript, Python
🤖 Servidor IA Local : http://127.0.0.1:8080
⚙️  Configuración    : quality_config.json cargado

Escribe tu prompt abajo para ejecutar una tarea con verificación automática.
Escribe 'exit' o 'quit' para salir de la terminal.
===================================================================

QualityDev> Crear módulo de autenticación con JWT

-------------------------------------------------------
🚀 EJECUTANDO TAREA: "Crear módulo de autenticación con JWT"
-------------------------------------------------------
[1/5] 📄 Inspeccionando sintaxis y estructura de archivos...
     Archivos inspeccionados: 10 | Estado: ✅ CORRECTA
[2/5] ❓ Formulando matriz de auto-preguntas y criterios...
[3/5] 🧪 Ejecutando suite de pruebas automatizadas y logs...
     Pruebas: ✅ PASARON
[4/5] 🦙 Conectando con servidor de IA local (http://127.0.0.1:8080)...
     Modelo activo detectado: Ternary-Bonsai-27B-Q2_0.gguf
--- 🤖 RESPUESTA DE LA IA LOCAL ---
...
[5/5] 📝 Registrando historial y estado en QUALITY_LOG.md...
=======================================================
   ✅ TAREA FINALIZADA | ESTADO: SISTEMA FUNCIONAL
=======================================================

QualityDev> 
```

---

### ⚙️ Configuración de IA Local con `quality_config.json`

Edita el archivo `quality_config.json` en la raíz de cualquier repositorio:

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

---

## 🌐 English

**QualityDev v2.0.0** introduces **Interactive REPL Terminal Mode**. Launch the interactive shell once and enter prompts continuously without running commands repeatedly with arguments.

```bash
# Launch interactive shell with Node.js:
node quality_dev.js

# Launch interactive shell with Python:
python quality_dev.py
```
