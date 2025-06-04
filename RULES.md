# Cursor Rules Guide

This guide documents the directory structure, naming patterns, and frontmatter conventions for `.mdc` files in the `.cursor/rules` directory.

## Overview

Cursor rules are stored as `.mdc` files (Markdown with Components) organized in subdirectories within `.cursor/rules`. Each rule file represents a specific workflow, template, or operational guideline that can be invoked to guide AI behavior.

## Frontmatter Structure

All `.mdc` files must include a frontmatter section at the top using YAML syntax:

```yaml
---
description: 
globs: 
alwaysApply: [true|false]
---
```

### Frontmatter Fields

- **`description`** (optional): A brief description of the rule's purpose. Often left empty.
- **`globs`** (optional): File glob patterns to match when this rule should apply. Often left empty.
- **`alwaysApply`** (required): Boolean value determining if the rule applies globally or only when explicitly invoked.
  - `true`: Rule applies to all operations (e.g., `_global.mdc`)
  - `false`: Rule applies only when specifically requested

## Directory Structure & Naming Conventions

Rules are organized into directories by category, with files using kebab-case naming:

```
.cursor/rules/
├── _global/                    # Global rules directory
│   └── _global.mdc            # Core operating directives (alwaysApply: true)
├── cli/                        # Command-line tool usage rules
│   ├── github-search.mdc
│   ├── pack.mdc
│   ├── worktree.mdc
│   └── wrangler.mdc
├── code/                       # Code-related rules
│   └── review.mdc
├── docs/                       # Documentation generation rules
│   ├── diagram.mdc
│   ├── openapi-spec.mdc
│   ├── prd.mdc
│   ├── structure.mdc
│   ├── sync.mdc
│   └── tech-stack.mdc
├── git/                        # Git and version control workflows
│   └── create.mdc             # Pull request creation
├── logging/                    # Logging-related rules
│   └── session.mdc
├── pnpm/                       # Package manager specific rules
│   └── fixes.mdc
├── project/                    # Project-wide management rules
│   ├── todos-next.mdc
│   └── update-rules.mdc
├── prompt/                     # Prompt engineering rules
│   └── improve.mdc
├── react/                      # Framework-specific rules
│   └── best-practices.mdc
├── scripts/                    # Script creation rules
│   └── create.mdc
├── task/                       # Task planning and execution
│   ├── execute.mdc
│   ├── next.mdc
│   ├── outline.mdc
│   └── plan.mdc
└── zen/                        # Coding philosophy
    └── coding.mdc
```

### Directory Categories

1. **`_global/`**: Global rules that apply across all operations
2. **`cli/`**: Command-line tool usage rules
3. **`docs/`**: Documentation generation and maintenance rules
4. **`task/`**: Task planning and execution rules
5. **`project/`**: Project-wide management rules
6. **`scripts/`**: Script creation and management rules
7. **`code/`**: Code review and quality rules
8. **`git/`**: Git workflows and version control operations
9. **`react/`, `pnpm/`**: Technology-specific rules
10. **`logging/`**: Logging and debugging rules
11. **`prompt/`**: Prompt engineering helpers
12. **`zen/`**: Coding philosophy and best practices

### Special Files

- **`_global/_global.mdc`**: The only file with `alwaysApply: true`. Contains core operating directives that apply to all operations.

## Content Structure

Each rule file contains:

1. **Frontmatter** (as described above)
2. **Title**: A clear H1 heading describing the rule's purpose
3. **Core Task/Goal**: A bold statement clearly defining what the rule accomplishes
4. **Instructions**: Detailed step-by-step instructions, often with:
   - Numbered or bulleted lists
   - Code examples in fenced code blocks
   - Command examples
   - Important notes in bold
5. **Remember Section**: Often ends with a **REMEMBER:** statement summarizing key points

## Best Practices

1. **Clear Titles**: Use descriptive H1 headings that immediately convey the rule's purpose
2. **Bold Key Instructions**: Use `**Your task:**` or `**Your Core Task:**` to highlight the main objective
3. **Structured Content**: Use consistent formatting with headers, lists, and code blocks
4. **Concrete Examples**: Include specific command examples and code snippets
5. **Explicit Constraints**: Clearly state what is allowed and what is forbidden
6. **Remember Statements**: End with a concise **REMEMBER:** section summarizing critical points

## Example Rule Structure

```markdown
---
description: 
globs:
alwaysApply: false
---
# [Clear, Descriptive Title]

**Your task: [Concise statement of the main objective]**

## [Section 1: Context or Prerequisites]

[Detailed instructions...]

## [Section 2: Main Process]

1. [Step 1]
2. [Step 2]
   - Sub-point
   - Sub-point

## [Section 3: Examples or Special Cases]

```bash
# Example command
example-command --flag value
```

**REMEMBER: [Key takeaway or critical constraint to follow]**
```

## Usage

Rules can be invoked in two ways:

1. **Automatically**: Rules with `alwaysApply: true` (currently only `_global/_global.mdc`)
2. **On Request**: Rules with `alwaysApply: false` are invoked when their specific functionality is needed

The AI assistant will select and apply the appropriate rule based on the user's request and the rule's directory/file location. For example:
- A request about GitHub searching would use `cli/github-search.mdc`
- A request to create a PRD would use `docs/prd.mdc`
- A request about task planning would use `task/plan.mdc`
- A request to create a pull request would use `git/create.mdc`
- A request about React best practices would use `react/best-practices.mdc`