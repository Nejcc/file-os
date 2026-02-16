# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FileOS (fos) is a file/folder-based virtual operating system implemented in TypeScript/Node.js. It provides an interactive shell environment with user authentication, file system commands, YAML-based configuration, and a system update/upgrade mechanism.

## Build & Run Commands

```bash
npm run install-os          # Initialize FileOS (creates directory structure, configs, users)
npm start                   # Run the runtime kernel (ts-node src/build/kernel/kernel.ts)
npm run dev                 # Development mode with watch (vite-node)
npm run build               # Compile TypeScript + Vite bundle (tsc && vite build)
```

No test framework is configured.

## Architecture

The system follows a kernel architecture with three main layers:

1. **Installation Layer** (`src/core/installer.ts` - `FileOSInstaller`): Handles first-time setup — prompts for config (or reads `install.json`), creates the directory tree under `src/build/`, generates YAML configs, hashes passwords, copies kernel source files.

2. **Runtime Layer** (`src/runtime-kernel.ts` - `RuntimeKernel`): The main shell loop — handles user login, command parsing/execution, file operations (`ls`, `cd`, `cat`, `nano`, `mkdir`, `rm`, `touch`, `echo`, `where`), user/system info commands, terminal config management, and caching (config cache with mtime tracking, directory cache with TTL).

3. **Update/Upgrade Engine** (`src/core/updater.ts` - `SystemUpdater` + `src/commands/sys.ts` - `SystemCommands`): Manages `sys update`/`sys upgrade`/`sys check` commands. Creates timestamped backups, processes update manifests (`update.yml`), verifies file integrity with SHA256, supports rollback.

**Entry points:**
- `src/install-kernel.ts` → installation CLI
- `src/main.ts` → runtime wrapper (imports from `src/build/kernel/`)

**Runtime directory structure** (created by installer under `src/build/`):
- `etc/` — YAML configs (system.yml, security.yml, network.yml, users.yml, sysconfig/)
- `home/` — per-user home directories
- `var/` — logs, backups, runtime data
- `bin/` — system binaries
- `kernel/` — copies of core source files

## Key Conventions

- **Config format**: YAML throughout (`js-yaml`), stored in `src/build/etc/`
- **Config keys**: snake_case; code variables: camelCase
- **Console output colors** (chalk): cyan=info, green=success, red=error, yellow=warning
- **Path handling**: always `path.join()` for cross-platform compatibility
- **Security**: SHA256 password hashing, root path boundary enforcement (sandboxed), session timeouts
- **Caching**: configs cached with file mtime invalidation; directory listings cached with configurable TTL
- **Auth flags**: `--skip-login` and `--auto-login=<username>` for development

## Dependencies

- **commander**: CLI framework for command parsing
- **chalk** (v4 - CJS): terminal styling
- **inquirer** (v8 - CJS): interactive prompts
- **js-yaml**: YAML parsing/serialization
- **vite + vite-node**: bundling and dev execution
