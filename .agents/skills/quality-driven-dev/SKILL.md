---
name: quality-driven-dev
description: Workflow autónomo de desarrollo orientado a la calidad. Formula preguntas críticas, genera código y tests de calidad en cualquier lenguaje (Python, JS/TS, Go, Rust, etc.), apoya el diagnóstico con git diff y QUALEX_LOG.md en caso de errores persistentes, verifica la funcionalidad y la UI/estética si existe interfaz gráfica, y permite destilar flujos o scripts repetitivos en nuevas Skills específicas del proyecto (.agents/skills/).
---

# Workflow Autónomo QualexDev (Desarrollo Orientado a Calidad, Verificación y Aprendizaje de Skills)

Este workflow está diseñado tanto para **crear proyectos desde cero** como para **aplicar mejoras, refactorizaciones y destilar flujos repetitivos en nuevas Skills reutilizables**.

---

## 🌐 Regla de Idioma Obligatoria (Language Policy)

- **REGLA CRÍTICA**: Debes responder SIEMPRE en el MISMO idioma en el que el usuario te formule la consulta o instrucción.
- Si el usuario escribe en español, responde en español.
- Si el usuario escribe en inglés, responde en inglés.
- Si el usuario escribe en otro idioma, responde en ese mismo idioma.

---

## 🎓 Aprendizaje y Creación de Nuevas Skills del Proyecto

Si durante el desarrollo o prueba del código la IA o el usuario generan un **script repetitivo**, un proceso de integración o un flujo de búsqueda web/análisis recurrente:

1. **Destilación en una Nueva Skill Local**:
   - La IA crea una nueva carpeta dentro del proyecto: `.agents/skills/<nombre-de-la-skill>/`.
   - Genera el archivo principal **`SKILL.md`** con el encabezado YAML (`name`, `description`) e instrucciones paso a paso.
   - Guarda los scripts ejecutables en `.agents/skills/<nombre-de-la-skill>/scripts/`.

2. **Autodescubrimiento e Integración Automática**:
   - Cualquier agente o sesión futura en este proyecto detectará la nueva Skill en `.agents/skills/` y la reutilizará automáticamente cada vez que una instrucción coincida con su descripción.

---

## 🔍 ¿Cómo resuelve la IA los errores persistentes? (`QUALEX_LOG.md` + `git diff`)

Cuando ocurre un error persistente o difícil de solucionar, la IA no intenta adivinar; combina **dos fuentes de diagnóstico complementarias**:

1. **`QUALEX_LOG.md` (Contexto Histórico y de Consola)**:
   - Revisa la tarea asignada, los tests ejecutados previamente y el *stacktrace* exacto o la salida de la consola.
   - Identifica *qué requerimiento o aserción rompió la aplicación*.

2. **`git diff` (Diferencias Exactas de Código)**:
   - Ejecuta `git diff` en la terminal para inspeccionar línea por línea qué cambió en el código fuente.
   - Identifica *qué líneas agregadas o eliminadas introdujeron la falla*.

3. **Estrategia de Reversión (*Rollback & Clean Retry*)**:
   - Si una refactorización rompe el sistema y no se soluciona en iteraciones cortas, la IA revisa `git diff`, revierte el cambio defectuoso con `git checkout` o `git restore` para retornar a la línea base funcional, y aplica un enfoque alternativo limpio.

---

## 📋 Las 5 Fases Obligatorias

### Fase 1: Auto-Interrogación y Planteamiento de Preguntas Clave
Antes de escribir o modificar código:
1. **Analiza el Requerimiento y el Código Existente**:
   - ¿Qué módulos existentes se verán afectados por la mejora?
   - ¿El proyecto ya tiene una suite de pruebas o configuración de entorno?
2. **Formula Preguntas Críticas y Casos de Borde (*Edge Cases*)**:
   - ¿La mejora requiere migración de datos, cambios de API o compatibilidad hacia atrás?
   - Si incluye Interfaz Gráfica (Web, App, GUI): ¿Cómo encaja el nuevo componente con el diseño actual?

---

### Fase 2: Desarrollo de la Mejora + Pruebas Automatizadas
1. **Código Modular que Preserva el Estilo del Proyecto**:
   - Modifica únicamente las partes necesarias manteniendo comentarios, docstrings y convenciones existentes.
2. **Suite de Pruebas Incremental**:
   - Crea nuevas pruebas para la mejora y actualiza las pruebas existentes si la firma o contrato cambió justificadamente.

---

### Fase 3: Ejecución de Tests, Inspección de `git diff` y Auto-Corrección
1. **Verificación Doble**:
   - Ejecuta las pruebas automatizadas (`pytest`, `npm test`, `node quality_dev.js`, etc.).
2. **Diagnóstico con `git diff` y Logs**:
   - Si un test falla, revisa el error en la terminal/log y ejecuta `git diff` para examinar los cambios recientes en el código.
   - Ajusta el código de forma iterativa hasta que el 100% de la suite pase.

---

### Fase 4: Verificación Visual & UI (Si la mejora incluye Interfaz Gráfica)
1. **Inspección de Cambios en la UI**:
   - Si la mejora modifica páginas HTML, componentes React/Vue/CSS o interfaces de usuario, renderiza y toma capturas de pantalla para verificar el cambio visual.
2. **Criterios de Coherencia Visual**:
   - Asegura que el nuevo elemento mantenga la misma línea estética (colores, tipografía, espacios, responsividad) que el resto de la aplicación.

---

### Fase 5: Entrega del Trabajo, Registro Histórico y Sugerencias
Al concluir la tarea:
1. **Registro Histórico de Cambios en `QUALEX_LOG.md`**:
   - Añade una entrada al archivo `QUALEX_LOG.md` registrando la fecha, la instrucción asignada, los tests ejecutados y confirmación de `✅ SISTEMA FUNCIONAL`.
2. **Sugerencias de Mejora Futura (Siguiente Nivel)**:
   - Proporciona de 3 a 5 recomendaciones sobre el siguiente paso ideal para continuar evolucionando el proyecto.
