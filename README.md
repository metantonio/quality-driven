# QualexDev - Sistema Autónomo de Desarrollo Basado en Calidad y Verificación
# QualexDev - Autonomous Quality-Driven Development System v3.0.0

[Español](#-español) | [English](#-english)

---

## 🌐 Español

**QualexDev v3.0.0** es un sistema universal para desarrollo de software orientado a la calidad y verificación automática. Funciona con **IAs Locales (`llama.cpp`, `Ollama`, `vLLM`, `LM Studio`)** y modelos en la nube.

---

### 🚀 1. Ejecución Directa (Sin Instalación Global)

**No es obligatorio instalar nada de forma global.** Puedes usar QualexDev inmediatamente en cualquier proyecto ejecutando directamente los archivos fuente:

```bash
# Con Node.js:
node quality_dev.js

# O con Python:
python quality_dev.py

# Iniciar con Dashboard Web sin instalar:
node quality_dev.js --ui
```

---

### 📦 2. Instalación CLI Global (Opcional)

Si prefieres disponer del comando `qualex` disponible de forma global en la terminal de cualquier carpeta:

```bash
# Instalación global desde la carpeta del proyecto:
npm install -g .

# O mediante npm:
npm install -g qualexdev
```

Una vez instalado globalmente, solo escribe `qualex` en cualquier repositorio:

```bash
qualex
# o con interfaz web:
qualex --ui
```

---

### 🎓 3. Auto-Copia e Inicialización de Skill y Configuración

Tanto en la ejecución directa (`node quality_dev.js`) como global (`qualex`), el sistema detecta si el proyecto objetivo carece de configuración y **crea/copia automáticamente**:

1. **`qualex_config.json`**: Archivo de configuración independiente de la IA local.
2. **`.agents/skills/quality-driven-dev/SKILL.md`**: Copia e inicializa automáticamente la Skill del flujo de trabajo en la carpeta `.agents/skills/` del proyecto.

---

### 🌐 4. Dashboard Web Control (Opcional)

Puedes abrir el panel de control web en paralelo a la consola REPL:

```bash
node quality_dev.js --ui
# o: qualex --ui
```

Accede desde tu navegador a **`http://localhost:3000`** para ver en vivo el estado del sistema, el registro de `QUALEX_LOG.md` y el mapa de dependencias.

### 🔧 Solución de Problemas (Troubleshooting)

#### ❓ El comando `qualex` o `qualexdev` no se reconoce tras `npm install -g .`

Si al ejecutar `qualex` recibes el error: `The term 'qualex' is not recognized as the name of a cmdlet...`, la ruta global de binarios de npm no está en la variable de entorno `PATH` de tu usuario.

**Solución rápida en Windows (PowerShell)**:

1. **Activar en la terminal actual de inmediato**:
   ```powershell
   $env:PATH += ";C:\Users\" + $env:USERNAME + "\AppData\Roaming\npm"
   ```

2. **Registrar permanentemente en el PATH del sistema (PowerShell)**:
   ```powershell
   [Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\Users\" + $env:USERNAME + "\AppData\Roaming\npm", "User")
   ```

*(Importante: Tras registrar el PATH permanentemente, cierra y abre una nueva ventana de terminal para que la consola cargue las nuevas variables).*

---

## 🌐 English

### 🚀 1. Direct Execution (No Global Installation Required)

**You do NOT need to install anything globally.** You can use QualexDev directly by running the source files:

```bash
# Run directly with Node.js:
node quality_dev.js

# Run directly with Python:
python quality_dev.py

# Launch direct execution with Web Dashboard:
node quality_dev.js --ui
```

---

### 📦 2. Global CLI Installation (Optional)

If you prefer to have the `qualex` command globally accessible anywhere:

```bash
npm install -g .
```

Then run anywhere:
```bash
qualex
# or with Web Dashboard:
qualex --ui
```

---

### 🔧 Troubleshooting

#### ❓ Command `qualex` is not recognized after `npm install -g .`

If Windows PowerShell throws `The term 'qualex' is not recognized...`, the npm global binaries folder is missing from your User `PATH` environment variable.

**Solution (PowerShell)**:

1. **Activate in current terminal session**:
   ```powershell
   $env:PATH += ";C:\Users\" + $env:USERNAME + "\AppData\Roaming\npm"
   ```

2. **Add permanently to User PATH**:
   ```powershell
   [Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\Users\" + $env:USERNAME + "\AppData\Roaming\npm", "User")
   ```
*(Note: Restart your terminal window after applying permanent PATH changes).*

