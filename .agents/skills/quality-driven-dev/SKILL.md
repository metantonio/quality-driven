---
name: quality-driven-dev
description: Autonomous quality-driven development workflow. Formulates critical questions, generates production-quality code and test suites in any language (Python, JS/TS, Go, Rust, etc.), diagnoses persistent issues using git diff and QUALEX_LOG.md, verifies visual GUI aesthetics, and distills repetitive workflows into reusable project skills (.agents/skills/).
---

# QualexDev Autonomous Workflow (Quality-Driven Development, Verification & Skill Learning)

This workflow is engineered to **build software projects from scratch**, **apply features and refactorings**, and **distill repetitive processes into reusable agent skills**.

---

## 🌐 Mandatory Language Policy

- **CRITICAL DIRECTIVE**: You MUST ALWAYS respond in the EXACT SAME language used by the user in their prompt.
- If the user writes in Spanish, respond in Spanish.
- If the user writes in English, respond in English.
- If the user writes in another language, respond in that same language.

---

## 💾 Automated File Creation & Editing Format (`CodeApplier`)

When creating or modifying files in the codebase (e.g., adding a test file or refactoring a module):
- Specify the relative file path directly in the code block header: ` ```javascript:tests/auth.test.js ` or ` ```python:tests/test_auth.py `.
- Alternatively, include a top-line comment inside the code block: `// File: tests/auth.test.js` or `# File: tests/test_auth.py`.
- QualexDev's `CodeApplier` engine will automatically create any necessary directories and write the files directly to disk.

---

## 🎓 Skill Distillation & Project Skill Learning

If an AI agent or developer creates a **repetitive script**, integration process, or recurring search/analysis workflow:

1. **Distill into a Local Skill**:
   - Create a directory inside the repository: `.agents/skills/<skill-name>/`.
   - Generate the primary **`SKILL.md`** file with YAML frontmatter (`name`, `description`) and step-by-step instructions.
   - Place executable scripts in `.agents/skills/<skill-name>/scripts/`.

2. **Automatic Discovery & Reuse**:
   - Any agent or future session will automatically discover the new skill in `.agents/skills/` and execute it whenever matching tasks are requested.

---

## 🔍 Diagnosing Persistent Failures (`QUALEX_LOG.md` + `git diff`)

When encountering persistent errors, combine **two authoritative diagnostic sources**:

1. **`QUALEX_LOG.md` (Console Output & Historical Context)**:
   - Inspect the assigned task, test suite results, and exact error stacktraces.
   - Pinpoint *which assertion or contract failed*.

2. **`git diff` (Exact Code Mutations)**:
   - Execute `git diff` in the shell to inspect line-by-line code modifications.
   - Pinpoint *which added or removed lines introduced the regression*.

3. **Rollback & Clean Retry Strategy**:
   - If a refactoring breaks tests and cannot be resolved in short iterations, review `git diff`, revert with `git checkout` or `git restore` back to a clean working state, and attempt a clean alternative approach.

---

## 📋 The 5 Mandatory Workflow Phases

### Phase 1: Self-Interrogation & Key Questions Matrix
Before writing or modifying code:
1. **Analyze Requirements & Codebase**:
   - Which existing modules will be impacted?
   - Is there an existing test runner or environment configuration?
2. **Formulate Edge Cases & Critical Questions**:
   - Are data migrations, API schema changes, or backward compatibility required?
   - For GUI/Web applications: How does the new component integrate with the current layout?

---

### Phase 2: Modular Implementation + Test Suite Development
1. **Maintain Code Style & Quality**:
   - Modify only necessary files while preserving existing docstrings, comments, and project conventions.
2. **Incremental Test Suite**:
   - Create tests for new features and update existing tests if function signatures or contracts changed.

---

### Phase 3: Automated Test Execution, `git diff` Inspection & Self-Correction
1. **Verification**:
   - Run automated test suites (`pytest`, `npm test`, `cargo test`, `go test ./...`, etc.).
2. **Iterative Diagnostics**:
   - If a test fails, inspect stdout/stderr logs and run `git diff`.
   - Iteratively adjust code until 100% of the test suite passes cleanly.

---

### Phase 4: UI & Visual Verification (For Graphical Interfaces)
1. **Visual Inspection**:
   - For HTML/CSS, React, Vue, or GUI applications, render pages and capture screenshots to verify visual correctness.
2. **Aesthetic Consistency**:
   - Ensure color palettes, typography, spacing, and responsiveness remain cohesive.

---

### Phase 5: Delivery, Historical Logging & Next Steps
Upon task completion:
1. **Log History in `QUALEX_LOG.md`**:
   - Append an entry in `QUALEX_LOG.md` recording timestamp, prompt, executed tests, and `✅ SYSTEM FUNCTIONAL` status.
2. **Actionable Future Recommendations**:
   - Provide 3 to 5 clear recommendations for the next logical step to evolve the project.
