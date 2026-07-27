---
name: quality-driven-dev
description: Workflow autónomo de desarrollo orientado a la calidad. Formula preguntas críticas, genera código y tests de calidad en cualquier lenguaje (Python, JS/TS, Go, Rust, etc.), verifica la funcionalidad y la UI/estética si existe interfaz gráfica, guarda el historial en QUALITY_LOG.md y entrega un reporte final con sugerencias de mejora.
---

# Workflow Autónomo QualityDriven (Desarrollo Orientado a Calidad y Verificación)

Este workflow está diseñado tanto para **crear proyectos desde cero** como para **aplicar mejoras, refactorizaciones y nuevas características sobre código ya existente**.

---

## 🔄 ¿Qué ocurre cuando el código ya existe y pides una tarea de mejora?

Cuando trabajas sobre una base de código existente, el sistema ejecuta el siguiente flujo de seguridad:

1. **Inspección y Línea Base (*Baseline*)**: Antes de modificar el código, inspecciona la estructura actual y ejecuta los tests existentes para asegurar que todo esté funcionando previamente.
2. **Análisis de Impacto**: Evalúa si la mejora genera *breaking changes*, afecta a otros módulos o requiere adaptar la interfaz gráfica.
3. **Desarrollo Progresivo de Tests y Código**: Diseña los nuevos tests que validan la mejora y actualiza el código respetando los patrones del proyecto.
4. **Verificación Doble**: Asegura que pasen tanto los nuevos tests como las pruebas anteriores.
5. **Registro Histórico de Cambios (`QUALITY_LOG.md`)**: Guarda un registro permanente de la fecha, tarea asignada, resultado de los tests y estado funcional del proyecto.

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

### Fase 3: Ejecución de Tests y Auto-Corrección Basada en Logs
1. **Verificación Doble**:
   - Ejecuta las pruebas automatizadas (`pytest`, `npm test`, `node quality_dev.js`, etc.).
2. **Corrección de Regresiones**:
   - Si un test existente o nuevo falla, analiza el *stacktrace* y los logs de consola y ajusta el código hasta que el 100% de la suite pase.

---

### Fase 4: Verificación Visual & UI (Si la mejora incluye Interfaz Gráfica)
1. **Inspección de Cambios en la UI**:
   - Si la mejora modifica páginas HTML, componentes React/Vue/CSS o interfaces de usuario, renderiza y toma capturas de pantalla para verificar el cambio visual.
2. **Criterios de Coherencia Visual**:
   - Asegura que el nuevo elemento mantenga la misma línea estética (colores, tipografía, espacios, responsividad) que el resto de la aplicación.

---

### Fase 5: Entrega del Trabajo, Registro Histórico y Sugerencias
Al concluir la tarea:
1. **Registro Histórico de Cambios en `QUALITY_LOG.md`**:
   - Añade una entrada al archivo `QUALITY_LOG.md` registrando la fecha, la instrucción asignada, los tests ejecutados y confirmación de `✅ SISTEMA FUNCIONAL`.
2. **Sugerencias de Mejora Futura (Siguiente Nivel)**:
   - Proporciona de 3 a 5 recomendaciones sobre el siguiente paso ideal para continuar evolucionando el proyecto.
