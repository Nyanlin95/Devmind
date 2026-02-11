---
name: { { name } }
description: { { description } }
category: { { category } }
---

# {{name}}

{{description}}

## Query

\`\`\`sql
{{query}}
\`\`\`

## Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |

{{#each parameters}}
| `{{name}}` | `{{type}}` | {{description}} |
{{/each}}

## Returns

{{returns}}

## Use Case

{{useCase}}

## Notes

{{notes}}
