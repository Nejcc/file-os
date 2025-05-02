# 🖥️ FileOS (fos)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

FileOS is a unique, file/folder-based operating system that operates within your current directory structure. It provides an interactive shell environment with a modern command-line interface for managing and navigating your file system.

## ✨ Features

### Core Features
- 🔒 Sandboxed environment (restricted to `src` directory)
- 🖥️ Interactive shell with custom prompt
- 🎨 Color-coded output for better visibility
- 📁 Detailed file and directory information

### Commands
- `ls` - List directory contents
- `ll` - List detailed directory contents with size and timestamps
- `cd <path>` - Navigate between directories
- `pwd` - Show current working directory
- `exit` - Exit FileOS
- `help` - Display available commands

## 🚀 Getting Started

### Prerequisites
- Node.js (v20.x or higher)
- npm (v9.x or higher)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/fileos.git
cd fileos
```

2. Install dependencies:
```bash
npm install
```

3. Start FileOS:
```bash
npm start
```

## 💻 Usage Examples

### Basic Navigation
```bash
fos> pwd
/home/user/projects/fileos/src

fos> ls
commands/
core/
kernel.ts
utils/

fos> ll
DIR  commands/     --         2024-02-20 15:30:45
DIR  core/        --         2024-02-20 15:30:45
FILE kernel.ts    2.5 KB     2024-02-20 15:30:45
DIR  utils/       --         2024-02-20 15:30:45
```

### Directory Navigation
```bash
fos> cd core
Changed directory to: /home/user/projects/fileos/src/core

fos> cd ..
Changed directory to: /home/user/projects/fileos/src
```

## 🛠️ Development

### Project Structure
```
fileos/
├── src/
│   ├── commands/    # Command implementations
│   ├── core/        # Core system components
│   ├── utils/       # Utility functions
│   └── kernel.ts    # Main system kernel
├── package.json     # Project dependencies
├── tsconfig.json    # TypeScript configuration
└── README.md       # Project documentation
```

### Running in Development Mode
```bash
npm run dev
```

### Building the Project
```bash
npm run build
```

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Adding or modifying tests
- `chore:` - Maintenance tasks

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


## 🙏 Acknowledgments

- [Commander.js](https://github.com/tj/commander.js/) for command-line interface
- [Chalk](https://github.com/chalk/chalk) for terminal styling 