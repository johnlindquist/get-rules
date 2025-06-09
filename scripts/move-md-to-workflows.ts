#!/usr/bin/env bun

import { readdir, rename, mkdir } from 'node:fs/promises';
import { join, dirname, basename, relative } from 'node:path';

async function ensureDir(dir: string) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

async function findMdFiles(dir: string): Promise<string[]> {
  const mdFiles: string[] = [];
  
  async function walk(currentDir: string) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('_')) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          mdFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentDir}:`, error);
    }
  }
  
  await walk(dir);
  return mdFiles;
}

async function main() {
  const projectRoot = process.cwd();
  const rulesDir = join(projectRoot, '.cursor', 'rules');
  const workflowsDir = join(projectRoot, '.cursor', 'workflows');
  
  console.log('🔍 Searching for .md files in .cursor/rules directory...');
  console.log('📁 Will move them to .cursor/workflows directory...\n');
  
  try {
    // Find all .md files in specific subdirectories
    const dirsToCheck = ['workflows', 'task', 'tools', 'documentation', 'development'];
    let allMdFiles: string[] = [];
    
    for (const dir of dirsToCheck) {
      const dirPath = join(rulesDir, dir);
      const mdFiles = await findMdFiles(dirPath).catch(() => []);
      allMdFiles = allMdFiles.concat(mdFiles);
    }
    
    if (allMdFiles.length === 0) {
      console.log('No .md files found to move.');
      return;
    }
    
    console.log(`Found ${allMdFiles.length} .md files. Moving...\n`);
    
    // Ensure workflows directory exists
    await ensureDir(workflowsDir);
    
    let movedCount = 0;
    
    for (const file of allMdFiles) {
      try {
        // Get the relative path from .cursor/rules
        const relativePath = relative(rulesDir, file);
        const newPath = join(workflowsDir, relativePath);
        const newDir = dirname(newPath);
        
        // Ensure the directory exists
        await ensureDir(newDir);
        
        // Move the file
        await rename(file, newPath);
        
        console.log(`✅ Moved: ${relativePath}`);
        movedCount++;
      } catch (error) {
        console.error(`❌ Error moving ${file}:`, error);
      }
    }
    
    console.log(`\n📊 Summary: Moved ${movedCount} out of ${allMdFiles.length} files to .cursor/workflows/.`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();