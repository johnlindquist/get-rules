#!/usr/bin/env bun

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

interface ValidationResult {
  path: string;
  valid: boolean;
  errors: string[];
}

async function findMdcFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await findMdcFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.mdc')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

function parseFrontmatter(content: string): { fields: string[]; values: Map<string, string> } | null {
  const lines = content.split('\n');
  const fields: string[] = [];
  const values = new Map<string, string>();
  
  if (lines[0] !== '---') {
    return null;
  }
  
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIndex = i;
      break;
    }
  }
  
  if (endIndex === -1) {
    return null;
  }
  
  // Parse frontmatter lines
  for (let i = 1; i < endIndex; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const field = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();
    
    fields.push(field);
    values.set(field, value);
  }
  
  return { fields, values };
}

function validateFrontmatter(filePath: string, content: string): ValidationResult {
  const result: ValidationResult = {
    path: filePath,
    valid: true,
    errors: []
  };
  
  const parsed = parseFrontmatter(content);
  
  if (!parsed) {
    result.valid = false;
    result.errors.push("Missing or invalid frontmatter section");
    return result;
  }
  
  const { fields, values } = parsed;
  
  // Check for required fields
  const requiredFields = ['description', 'globs', 'alwaysApply'];
  for (const field of requiredFields) {
    if (!fields.includes(field)) {
      result.valid = false;
      result.errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Check alwaysApply value
  if (values.has('alwaysApply')) {
    const alwaysApplyValue = values.get('alwaysApply');
    if (alwaysApplyValue !== 'true' && alwaysApplyValue !== 'false') {
      result.valid = false;
      result.errors.push(`Field 'alwaysApply' must be 'true' or 'false', got: '${alwaysApplyValue}'`);
    }
  }
  
  // Check for unexpected fields
  const unexpectedFields = fields.filter(field => !requiredFields.includes(field));
  if (unexpectedFields.length > 0) {
    result.valid = false;
    result.errors.push(`Unexpected fields in frontmatter: ${unexpectedFields.join(', ')}`);
  }
  
  // Check field order
  const expectedOrder = ['description', 'globs', 'alwaysApply'];
  const actualOrder = fields.filter(field => expectedOrder.includes(field));
  
  if (actualOrder.length === 3) {
    const orderMatches = actualOrder.every((field, index) => field === expectedOrder[index]);
    if (!orderMatches) {
      result.valid = false;
      result.errors.push(`Fields must be in order: description, globs, alwaysApply (found: ${actualOrder.join(', ')})`);
    }
  }
  
  return result;
}

async function main() {
  console.log("🔍 Validating MDC frontmatter...\n");
  
  const rulesDir = join(process.cwd(), '.cursor', 'rules');
  const cursorGeneratedDir = join(process.cwd(), 'cursor-generated-rules');
  
  const allFiles: string[] = [];
  
  // Check .cursor/rules directory
  try {
    const cursorRulesFiles = await findMdcFiles(rulesDir);
    allFiles.push(...cursorRulesFiles);
    console.log(`Found ${cursorRulesFiles.length} .mdc files in .cursor/rules`);
  } catch (error) {
    console.log("No .cursor/rules directory found");
  }
  
  // Check cursor-generated-rules directory
  try {
    const generatedFiles = await findMdcFiles(cursorGeneratedDir);
    allFiles.push(...generatedFiles);
    console.log(`Found ${generatedFiles.length} .mdc files in cursor-generated-rules`);
  } catch (error) {
    console.log("No cursor-generated-rules directory found");
  }
  
  if (allFiles.length === 0) {
    console.log("\n❌ No .mdc files found to validate");
    process.exit(1);
  }
  
  console.log(`\n📋 Validating ${allFiles.length} total files...\n`);
  
  const results: ValidationResult[] = [];
  
  for (const file of allFiles) {
    try {
      const content = await readFile(file, 'utf-8');
      const result = validateFrontmatter(file, content);
      results.push(result);
    } catch (error) {
      results.push({
        path: file,
        valid: false,
        errors: [`Failed to read file: ${error instanceof Error ? error.message : String(error)}`]
      });
    }
  }
  
  // Generate report
  const invalidResults = results.filter(r => !r.valid);
  const validCount = results.filter(r => r.valid).length;
  
  console.log("═".repeat(80));
  console.log("VALIDATION REPORT");
  console.log("═".repeat(80));
  console.log(`Total files checked: ${results.length}`);
  console.log(`Valid files: ${validCount}`);
  console.log(`Invalid files: ${invalidResults.length}`);
  console.log("═".repeat(80));
  
  if (invalidResults.length === 0) {
    console.log("\n✅ All files have valid frontmatter!");
  } else {
    console.log("\n❌ Invalid files found:\n");
    
    for (const result of invalidResults) {
      const relativePath = result.path.replace(process.cwd() + '/', '');
      console.log(`📄 ${relativePath}`);
      for (const error of result.errors) {
        console.log(`   ⚠️  ${error}`);
      }
      console.log("");
    }
  }
  
  // Exit with error code if validation failed
  process.exit(invalidResults.length > 0 ? 1 : 0);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});