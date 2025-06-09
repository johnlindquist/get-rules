#!/usr/bin/env bun

import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve, dirname, relative, extname, basename } from 'node:path';

interface FileReference {
  filePath: string;
  line: number;
  column: number;
  match: string;
  updatedMatch?: string;
}

// Patterns to find file references
const FILE_REFERENCE_PATTERNS = [
  // Markdown links: [text](path/to/file.md)
  /\[([^\]]+)\]\(([^)]+\.(mdc|md))\)/g,
  // Import/require statements
  /(?:import|require)\s*\(?['"`]([^'"`]+\.(mdc|md))['"`]\)?/g,
  // Direct file paths in quotes with backticks
  /[`'"]([^`'"]+\.(mdc|md))[`'"]/g,
  // File paths without quotes (be more careful with these)
  /(?:^|\s)([./][\w./-]+\.(mdc|md))(?:\s|$)/gm,
  // References in text like "task-execute.mdc" or "update-project.mdc"
  /\b([\w-]+\.(mdc|md))\b/g,
];

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findAllFiles(dir: string, extensions: string[]): Promise<string[]> {
  const files: string[] = [];
  
  async function walk(currentDir: string) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        // Skip node_modules and .git directories
        if (entry.isDirectory() && !['node_modules', '.git', 'tmp'].includes(entry.name)) {
          await walk(fullPath);
        } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentDir}:`, error);
    }
  }
  
  await walk(dir);
  return files;
}

function extractFileReferences(content: string, filePath: string): FileReference[] {
  const references: FileReference[] = [];
  const lines = content.split('\n');
  
  lines.forEach((line, lineIndex) => {
    FILE_REFERENCE_PATTERNS.forEach(pattern => {
      // Reset regex state
      pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.exec(line)) !== null) {
        // Extract the file path from the match
        let referencedFile = match[match.length - 2] || match[1];
        
        // Skip URLs and anchors
        if (referencedFile.startsWith('http') || referencedFile.startsWith('#')) {
          continue;
        }
        
        references.push({
          filePath,
          line: lineIndex + 1,
          column: match.index,
          match: referencedFile,
        });
      }
    });
  });
  
  return references;
}

async function resolveReference(reference: FileReference, baseDir: string): Promise<FileReference> {
  const dir = dirname(reference.filePath);
  let resolvedPath: string;
  
  // Handle different path types
  if (reference.match.startsWith('/')) {
    // Absolute path from project root
    resolvedPath = join(baseDir, reference.match);
  } else if (reference.match.startsWith('./') || reference.match.startsWith('../')) {
    // Relative path
    resolvedPath = resolve(dir, reference.match);
  } else if (reference.match.includes('/')) {
    // Path with directory but no ./ prefix
    resolvedPath = resolve(dir, reference.match);
  } else {
    // Just a filename - need to search for it
    // For files that were in .cursor/rules, check both old and new locations
    const possiblePaths = [
      resolve(dir, reference.match),
      join(baseDir, '.cursor/rules', reference.match),
      join(baseDir, '.cursor/workflows', reference.match),
      // Check subdirectories in both old and new locations
      join(baseDir, '.cursor/rules/workflows/task', reference.match),
      join(baseDir, '.cursor/workflows/workflows/task', reference.match),
      join(baseDir, '.cursor/rules/task', reference.match),
      join(baseDir, '.cursor/workflows/task', reference.match),
      join(baseDir, '.cursor/rules/automation', reference.match),
      join(baseDir, '.cursor/workflows/automation', reference.match),
      join(baseDir, '.cursor/rules/workflows/github', reference.match),
      join(baseDir, '.cursor/workflows/workflows/github', reference.match),
      join(baseDir, '.cursor/rules/tools/cli', reference.match),
      join(baseDir, '.cursor/workflows/tools/cli', reference.match),
    ];
    
    // Find the first existing path
    for (const path of possiblePaths) {
      if (await fileExists(path)) {
        resolvedPath = path;
        break;
      }
      
      // Try with alternate extension
      const ext = extname(path);
      const basePath = path.slice(0, -ext.length);
      const alternateExt = ext === '.mdc' ? '.md' : '.mdc';
      const alternatePath = basePath + alternateExt;
      
      if (await fileExists(alternatePath)) {
        // Check if this file is in workflows directory
        if (alternatePath.includes('.cursor/workflows/')) {
          // Update the reference with the correct extension
          const updatedMatch = reference.match.slice(0, -ext.length) + alternateExt;
          return {
            ...reference,
            updatedMatch,
          };
        }
      }
    }
    
    // If no path found, use the first one
    if (!resolvedPath) {
      resolvedPath = possiblePaths[0];
    }
  }
  
  // Check if file exists
  if (await fileExists(resolvedPath)) {
    return reference;
  }
  
  // Try swapping extension
  const ext = extname(resolvedPath);
  const basePath = resolvedPath.slice(0, -ext.length);
  const alternateExt = ext === '.mdc' ? '.md' : '.mdc';
  const alternatePath = basePath + alternateExt;
  
  if (await fileExists(alternatePath)) {
    // Check if this file is in workflows directory
    if (alternatePath.includes('.cursor/workflows/')) {
      // Update the reference with the correct extension
      const updatedMatch = reference.match.slice(0, -ext.length) + alternateExt;
      return {
        ...reference,
        updatedMatch,
      };
    }
  }
  
  return reference;
}

async function updateFileContent(filePath: string, references: FileReference[]): Promise<number> {
  if (references.length === 0) return 0;
  
  let content = await readFile(filePath, 'utf-8');
  let updateCount = 0;
  
  // Sort references by position (reverse order to avoid offset issues)
  const sortedRefs = references
    .filter(ref => ref.updatedMatch)
    .sort((a, b) => b.line - a.line || b.column - a.column);
  
  // Apply updates
  for (const ref of sortedRefs) {
    if (ref.updatedMatch) {
      const oldContent = content;
      content = content.replace(ref.match, ref.updatedMatch);
      
      if (oldContent !== content) {
        updateCount++;
      }
    }
  }
  
  if (updateCount > 0) {
    await writeFile(filePath, content);
  }
  
  return updateCount;
}

async function main() {
  const projectRoot = process.cwd();
  
  console.log('🔍 Scanning for files containing .mdc/.md references...\n');
  
  // Find all text files that might contain references
  const fileExtensions = ['.md', '.mdc', '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.txt'];
  const allFiles = await findAllFiles(projectRoot, fileExtensions);
  
  console.log(`Found ${allFiles.length} files to scan.\n`);
  
  let totalReferences = 0;
  let totalUpdates = 0;
  const filesToUpdate: Map<string, FileReference[]> = new Map();
  
  // Process each file
  for (const file of allFiles) {
    try {
      const content = await readFile(file, 'utf-8');
      const references = extractFileReferences(content, file);
      
      if (references.length > 0) {
        const resolvedRefs: FileReference[] = [];
        
        for (const ref of references) {
          const resolved = await resolveReference(ref, projectRoot);
          if (resolved.updatedMatch) {
            resolvedRefs.push(resolved);
          }
        }
        
        if (resolvedRefs.length > 0) {
          filesToUpdate.set(file, resolvedRefs);
          totalReferences += resolvedRefs.length;
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }
  
  // Display what will be updated
  if (filesToUpdate.size > 0) {
    console.log('📝 Files to update:\n');
    
    for (const [file, refs] of filesToUpdate) {
      console.log(`  ${relative(projectRoot, file)}:`);
      for (const ref of refs) {
        console.log(`    Line ${ref.line}: ${ref.match} → ${ref.updatedMatch}`);
      }
      console.log();
    }
    
    // Apply updates
    console.log('✏️  Applying updates...\n');
    
    for (const [file, refs] of filesToUpdate) {
      const updateCount = await updateFileContent(file, refs);
      if (updateCount > 0) {
        totalUpdates += updateCount;
        console.log(`  ✅ Updated ${updateCount} reference(s) in ${relative(projectRoot, file)}`);
      }
    }
    
    console.log(`\n📊 Summary: Updated ${totalUpdates} references across ${filesToUpdate.size} files.`);
  } else {
    console.log('✨ No file references need updating!');
  }
}

main().catch(console.error);