#!/usr/bin/env bun

import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, dirname, basename, relative } from 'node:path';
import matter from 'gray-matter';

interface FrontmatterData {
  alwaysApply?: boolean;
  globs?: string | string[] | undefined;
  [key: string]: any;
}

async function ensureDir(dir: string) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

async function findMdcFiles(dir: string): Promise<string[]> {
  const mdcFiles: string[] = [];
  
  async function walk(currentDir: string) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.mdc')) {
          mdcFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentDir}:`, error);
    }
  }
  
  await walk(dir);
  return mdcFiles;
}

async function processMdcFile(filePath: string, rulesDir: string, workflowsDir: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf-8');
    
    // Try to parse with gray-matter, but handle YAML errors
    let data: FrontmatterData;
    let markdownContent: string;
    
    try {
      const parsed = matter(content);
      data = parsed.data as FrontmatterData;
      markdownContent = parsed.content;
    } catch (yamlError) {
      // If YAML parsing fails, try to parse manually
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        console.log(`⚠️  No frontmatter found in ${basename(filePath)}`);
        return false;
      }
      
      // Parse frontmatter manually
      const frontmatterText = frontmatterMatch[1];
      markdownContent = frontmatterMatch[2];
      
      // Simple parsing for our specific case
      const alwaysApplyMatch = frontmatterText.match(/alwaysApply:\s*(true|false)/);
      const globsMatch = frontmatterText.match(/globs:\s*(.+)/);
      
      data = {
        alwaysApply: alwaysApplyMatch ? alwaysApplyMatch[1] === 'true' : undefined,
        globs: globsMatch ? globsMatch[1].trim() : undefined
      };
    }
    
    // Check if alwaysApply is false and globs is undefined or empty
    if (data.alwaysApply === false && (!data.globs || data.globs === '')) {
      // Get the relative path from .cursor/rules
      const relativePath = relative(rulesDir, filePath);
      const relativeDir = dirname(relativePath);
      const fileName = basename(relativePath, '.mdc') + '.md';
      
      // Create the new path in .cursor/workflows
      const newDir = join(workflowsDir, relativeDir);
      const newPath = join(newDir, fileName);
      
      // Ensure the directory exists
      await ensureDir(newDir);
      
      // Write the content without frontmatter
      await writeFile(newPath, markdownContent.trim() + '\n');
      
      // Delete the original .mdc file
      await unlink(filePath);
      
      console.log(`✅ Moved: ${relativePath} → workflows/${relativeDir}/${fileName}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

async function main() {
  const projectRoot = process.cwd();
  const rulesDir = join(projectRoot, '.cursor', 'rules');
  const workflowsDir = join(projectRoot, '.cursor', 'workflows');
  
  console.log('🔍 Searching for .mdc files in .cursor/rules directory...');
  console.log('📁 Will move qualifying files to .cursor/workflows directory...\n');
  
  try {
    const mdcFiles = await findMdcFiles(rulesDir);
    
    if (mdcFiles.length === 0) {
      console.log('No .mdc files found in .cursor/rules directory.');
      return;
    }
    
    console.log(`Found ${mdcFiles.length} .mdc files. Processing...\n`);
    
    // Ensure workflows directory exists
    await ensureDir(workflowsDir);
    
    let convertedCount = 0;
    
    for (const file of mdcFiles) {
      const converted = await processMdcFile(file, rulesDir, workflowsDir);
      if (converted) {
        convertedCount++;
      }
    }
    
    console.log(`\n📊 Summary: Moved ${convertedCount} out of ${mdcFiles.length} files to .cursor/workflows/.`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();