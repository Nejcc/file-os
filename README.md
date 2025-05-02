# FileOS (fos)

FileOS is a unique file/folder-based operating system that operates directly within your current directory. It provides a command-line interface for interacting with your files and directories in a way that feels like a complete operating system.

## Features

- File and directory navigation
- Directory listing with color-coded output
- Working directory management
- Extensible command system

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

To start FileOS, run:
```bash
npm start
```

### Available Commands

- `ls` - List directory contents
- `cd <path>` - Change current directory
- `pwd` - Print working directory

## Development

To run in development mode with auto-reload:
```bash
npm run dev
```

To build the project:
```bash
npm run build
```

## Project Structure

- `src/kernel.ts` - Main entry point and core functionality
- `src/core/` - Core system components
- `src/commands/` - Command implementations
- `src/utils/` - Utility functions

## License

MIT 