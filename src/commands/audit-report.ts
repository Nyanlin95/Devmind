import type { DesignAuditFinding } from './audit-design.js';

interface LearningItem {
  timestamp: string;
  category: string;
  content: string;
}

interface AuditResult {
  learning: LearningItem;
  status: 'covered' | 'needs-review';
  matchedFiles: string[];
}

export function buildLearningAuditReport(
  results: AuditResult[],
  covered: number,
  needsReview: number,
): string {
  let report = '# Learning Audit Report\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += `- Total learnings: ${results.length}\n`;
  report += `- Covered: ${covered}\n`;
  report += `- Needs review: ${needsReview}\n\n`;

  for (const item of results) {
    report += `## ${item.status === 'covered' ? 'Covered' : 'Needs Review'} - ${item.learning.category}\n\n`;
    report += `${item.learning.content}\n\n`;
    if (item.matchedFiles.length > 0) {
      report += 'Matched files:\n';
      for (const file of item.matchedFiles) {
        report += `- \`${file}\`\n`;
      }
      report += '\n';
    } else {
      report += 'Matched files: none\n\n';
    }
  }

  return report;
}

export function summarizeDesignFindings(findings: DesignAuditFinding[]): {
  findings: number;
  errors: number;
  warnings: number;
} {
  return {
    findings: findings.length,
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warn').length,
  };
}
