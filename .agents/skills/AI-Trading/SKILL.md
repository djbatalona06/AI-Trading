```markdown
# AI-Trading Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the AI-Trading TypeScript codebase. You'll learn how to structure files, write imports and exports, and follow the project's testing patterns. While no automated workflows were detected, this guide also suggests helpful commands for common developer tasks.

## Coding Conventions

### File Naming
- **Style:** camelCase
- **Example:**  
  ```
  tradeEngine.ts
  marketDataFetcher.ts
  ```

### Import Style
- **Style:** Absolute imports (from the project root, not relative paths)
- **Example:**
  ```typescript
  import { TradeEngine } from 'services/tradeEngine';
  ```

### Export Style
- **Style:** Named exports (not default)
- **Example:**
  ```typescript
  // In tradeEngine.ts
  export function executeTrade(order) { ... }

  // Usage
  import { executeTrade } from 'services/tradeEngine';
  ```

### Commit Patterns
- **Type:** Freeform (no enforced prefixes)
- **Average Length:** 46 characters

## Workflows

_No automated workflows were detected in this repository. Below are suggested manual workflows for common development tasks._

### Running Tests
**Trigger:** When you want to run the test suite.
**Command:** `/test`

1. Ensure your code changes are saved.
2. Run the test command (e.g., `npm test` or `yarn test`).
3. Review the output for any failing tests.

### Adding a New Module
**Trigger:** When you need to add a new feature or component.
**Command:** `/add-module`

1. Create a new file using camelCase naming (e.g., `orderManager.ts`).
2. Use absolute imports for dependencies.
3. Export functions or classes using named exports.
4. Write corresponding tests in a file named `orderManager.test.ts`.

### Refactoring Code
**Trigger:** When improving or restructuring existing code.
**Command:** `/refactor`

1. Update file and variable names to follow camelCase.
2. Convert any relative imports to absolute imports.
3. Ensure all exports are named.
4. Update or add tests as needed.

## Testing Patterns

- **Framework:** Unknown (no specific testing framework detected)
- **Test File Pattern:** Files ending with `.test.ts`
- **Example:**
  ```typescript
  // orderManager.test.ts
  import { createOrder } from 'services/orderManager';

  test('should create a new order', () => {
    const order = createOrder(...);
    expect(order).toBeDefined();
  });
  ```

## Commands

| Command      | Purpose                                      |
|--------------|----------------------------------------------|
| /test        | Run the test suite                           |
| /add-module  | Add a new module following conventions       |
| /refactor    | Refactor code to match project standards     |
```
