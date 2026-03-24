---
description: Analyze how a production layer component integrates with existing code
argument-hint: <component name>
---

# Analyze Integration Points

Analyze how a specific Production Layer component should integrate with the existing ISEE v2 codebase.

## Component
$ARGUMENTS

## Your Task

1. Read the component requirements from IMPLEMENTATION-PLAN.md
2. Read the relevant section of PRODUCTION-LAYER-SPEC.md
3. Examine the existing code that this component must integrate with:
   - src/server.ts (for middleware, routes)
   - src/pipeline.ts (for pipeline instrumentation)
   - src/types.ts (for type additions)
   - src/clients/*.ts (for client wrappers)

4. Identify:
   - Exact files that need modification
   - Where new code should be imported/called
   - Any existing patterns to follow
   - Potential conflicts or considerations

5. Provide a concrete integration plan with code locations.
