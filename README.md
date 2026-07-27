# QualexDev - Sistema Autónomo de Desarrollo Basado en Calidad y Verificación
# QualexDev - Autonomous Quality-Driven Development System v3.0.0

[Español](#-español) | [English](#-english)

---

## 🌐 Español

**QualexDev v3.0.0** es un sistema universal CLI y Terminal REPL para desarrollo de software orientado a la calidad y verificación automática. Funciona con **IAs Locales (`llama.cpp`, `Ollama`, `vLLM`, `LM Studio`)** y modelos en la nube.

---

### 📦 1. Instalación Global CLI (`qualex` / `qualexdev`)

Puedes instalar **QualexDev** como un comando global en tu sistema para usarlo en cualquier proyecto:

```bash
# Instalación global desde la carpeta del proyecto:
npm install -g .

# O con npm global:
npm install -g qualexdev
```

Una vez instalado, abre la consola en la carpeta de **cualquier proyecto** y ejecuta:

```bash
qualex
# o también:
qualexdev
```

---

### 🎓 2. Auto-Copia e Inicialización de Skill y Configuración

Al ejecutar `qualex` en cualquier carpeta por primera vez, el sistema detecta si el proyecto carece de configuración y **crea/copia automáticamente**:

1. **`qualex_config.json`**: Archivo de configuración independiente de la IA y pruebas.
2. **`.agents/skills/quality-driven-dev/SKILL.md`**: Copia e inicializa automáticamente la Skill del flujo de trabajo de 5 fases en la carpeta `.agents/skills/` del proyecto objetivo.

---

### 🌐 3. Dashboard Web Control (Opcional)

Si deseas visualizar el estado del proyecto, el grafo de dependencias y el historial de logs en una interfaz web sin perder la consola interactiva REPL:

```bash
# Iniciar la terminal interactiva con Dashboard Web en paralelo:
qualex --ui
```

Abre tu navegador en **`http://localhost:3000`** para acceder al **Dashboard Web de QualexDev** (Dark Mode, visualización en vivo de logs y mapa de dependencias de módulos).

---

### ⚙️ 4. Configuración en `qualex_config.json`

```json
{
  "name": "QualexDev Configuration",
  "version": "3.0.0",
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
    "auto_append": true,
    "max_log_size_kb": 250,
    "max_recent_entries": 10
  }
}
```

---

## 🌐 English

**QualexDev v3.0.0** includes global CLI installation, auto-copy of Skill rules (`.agents/skills/quality-driven-dev/SKILL.md`), and an optional Web Dashboard (`http://localhost:3000`).

### 📦 Global CLI Installation

```bash
npm install -g qualexdev
```

Run in any repository:
```bash
qualex
# or
qualex --ui
```
