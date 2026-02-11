/**
 * Generate architecture documentation template
 */

export function generateArchitecture(): string {
  return `# Architecture

## Directory Structure

| Layer | Description |
|-------|-------------|
| \`src/\` | Main source code |
| \`components/\` | Reusable UI components |
| \`hooks/\` | Custom React hooks |
| \`utils/\` | Utility functions |
| \`services/\` | API services |
| \`types/\` | TypeScript definitions |

## Data Flow

_Describe how data flows through your application._

## Key Patterns

- **Component Pattern**: Presentational + Container components
- **State Management**: _Describe your approach_
- **API Layer**: _Describe your API patterns_

## Dependencies

_Describe key dependencies and their purposes._
`;
}
