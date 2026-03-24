---
description: Create tests for an implemented component
argument-hint: <component description>
---

# Create Tests

You have implemented a component for ISEE v2.

## Task

$ARGUMENTS

## Your Mission

1. Review what was implemented in the previous step
2. Create appropriate unit tests if the component warrants testing
3. Tests should go in a `test/` directory or alongside the source file with `.test.ts` extension
4. Use Bun's test framework (`bun:test`)

Example test structure:
```typescript
import { describe, test, expect } from 'bun:test';

describe('ComponentName', () => {
  test('should do something', () => {
    // Test implementation
  });
});
```

If tests aren't applicable for this component (e.g., configuration files, simple types), explain why and skip test creation.
