/**
 * Custom Gherkin parser — not Cucumber-JS.
 *
 * Parses .feature files into a structured AST that the
 * test runner can execute directly.
 */

export interface Feature {
  name: string;
  description: string;
  tags: string[];
  background?: Scenario;
  scenarios: Scenario[];
  filePath: string;
}

export interface Scenario {
  name: string;
  tags: string[];
  steps: Step[];
  examples?: DataTable[];
}

export interface Step {
  keyword: StepKeyword;
  text: string;
  dataTable?: DataTable;
  docString?: string;
  line: number;
}

export type StepKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

export interface DataTable {
  headers: string[];
  rows: string[][];
}

export class GherkinParser {
  /**
   * Parse a .feature file into a Feature AST.
   */
  parse(source: string, filePath: string): Feature {
    const lines = source.split('\n');
    const feature: Feature = {
      name: '',
      description: '',
      tags: [],
      scenarios: [],
      filePath,
    };

    let currentScenario: Scenario | null = null;
    let pendingTags: string[] = [];
    let inDocString = false;
    let docStringContent = '';
    let inDescription = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();
      const lineNum = i + 1;

      // Skip empty lines and comments
      if (trimmed === '' || trimmed.startsWith('#')) {
        if (inDescription) inDescription = false;
        continue;
      }

      // Doc strings
      if (trimmed === '"""' || trimmed === "'''") {
        if (inDocString) {
          const lastStep = currentScenario?.steps.at(-1);
          if (lastStep) {
            lastStep.docString = docStringContent;
          }
          docStringContent = '';
          inDocString = false;
        } else {
          inDocString = true;
        }
        continue;
      }

      if (inDocString) {
        docStringContent += (docStringContent ? '\n' : '') + line;
        continue;
      }

      // Tags
      if (trimmed.startsWith('@')) {
        pendingTags = trimmed.split(/\s+/).filter((t) => t.startsWith('@'));
        continue;
      }

      // Feature
      if (trimmed.startsWith('Feature:')) {
        feature.name = trimmed.slice('Feature:'.length).trim();
        feature.tags = pendingTags;
        pendingTags = [];
        inDescription = true;
        continue;
      }

      // Description lines (after Feature: before first Scenario/Background)
      if (inDescription && !trimmed.match(/^(Scenario|Background|Rule)(\s+Outline)?:/)) {
        feature.description += (feature.description ? '\n' : '') + trimmed;
        continue;
      }

      // Background
      if (trimmed.startsWith('Background:')) {
        currentScenario = {
          name: trimmed.slice('Background:'.length).trim(),
          tags: [],
          steps: [],
        };
        feature.background = currentScenario;
        inDescription = false;
        continue;
      }

      // Scenario / Scenario Outline
      if (trimmed.startsWith('Scenario:') || trimmed.startsWith('Scenario Outline:')) {
        const prefix = trimmed.startsWith('Scenario Outline:')
          ? 'Scenario Outline:'
          : 'Scenario:';
        currentScenario = {
          name: trimmed.slice(prefix.length).trim(),
          tags: pendingTags,
          steps: [],
        };
        pendingTags = [];
        feature.scenarios.push(currentScenario);
        inDescription = false;
        continue;
      }

      // Steps
      const stepMatch = trimmed.match(/^(Given|When|Then|And|But)\s+(.+)/);
      if (stepMatch && currentScenario) {
        currentScenario.steps.push({
          keyword: stepMatch[1] as StepKeyword,
          text: stepMatch[2]!,
          line: lineNum,
        });
        continue;
      }

      // Examples table
      if (trimmed.startsWith('Examples:') && currentScenario) {
        // Next lines will be table rows — handled by data table parsing
        continue;
      }

      // Data table rows
      if (trimmed.startsWith('|') && currentScenario) {
        const cells = trimmed
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());

        const lastStep = currentScenario.steps.at(-1);
        if (lastStep) {
          if (!lastStep.dataTable) {
            lastStep.dataTable = { headers: cells, rows: [] };
          } else {
            lastStep.dataTable.rows.push(cells);
          }
        }
      }
    }

    return feature;
  }
}
