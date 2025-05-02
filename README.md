# 🖥️ FileOS (fos)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

FileOS is a unique, file/folder-based operating system that operates within your current directory structure. It provides an interactive shell environment with a modern command-line interface, user management, and configuration system.

## ✨ Features

### Core Features
- 🔒 Secure user authentication and session management
- 🖥️ Interactive shell with modern features
- 🎨 Customizable terminal with syntax highlighting
- 📁 Detailed file and directory management
- ⚙️ YAML-based configuration system
- 🔐 User and group permissions
- 📝 Command history with search
- 🔄 Tab completion for commands and paths

### Terminal Features
- Syntax highlighting for commands
- Auto-suggestions based on history
- Tab completion for files and directories
- Command validation
- Smart directory navigation
- Configurable prompt and colors
- History search and navigation

### Commands
- `ls`, `ll` - List directory contents (simple and detailed)
- `cd <path>` - Navigate between directories
- `pwd` - Show current working directory
- `mkdir`, `rm` - Directory operations
- `touch`, `cat`, `echo` - File operations
- `nano` - Simple file editor
- `whoami`, `groups` - User information
- `where` - File search
- `terminal config` - View/edit terminal settings
- `history` - Command history
- `help` - Display available commands
- `exit` - Exit FileOS

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

3. Create installation configuration:
```bash
cp src/example.install.json src/install.json
# Edit src/install.json with your preferred settings
```

4. Run the installation:
```bash
npm run install-os
```

5. Start FileOS:
```bash
npm start
```

## 💻 Usage Examples

### Authentication
```bash
FileOS v1.0.0
Username: admin
Password: ****

Welcome to FileOS!
Type "help" for available commands.
```

### File Operations
```bash
admin@fileos /home/admin> ls
documents/
downloads/
.history
.terminal

admin@fileos /home/admin> mkdir projects
Created directory: projects

admin@fileos /home/admin> cd projects
Changed directory to: /home/admin/projects
```

### Terminal Configuration
```bash
admin@fileos /> terminal config
{
  "features": {
    "autocompletion": true,
    "syntax_highlighting": true,
    "command_validation": true,
    // ... more settings
  }
}
```

## 🛠️ Development

### Project Structure
```
fileos/
├── src/
│   ├── core/           # Core system components
│   │   └── installer.ts  # Installation system
│   ├── build/          # Runtime file system
│   │   ├── bin/         # System binaries
│   │   ├── etc/         # Configuration files
│   │   │   ├── system/    # System config
│   │   │   ├── security/  # Security settings
│   │   │   ├── network/   # Network config
│   │   │   └── users/     # User management
│   │   ├── home/        # User home directories
│   │   └── var/         # Variable data
│   ├── runtime-kernel.ts  # Runtime system kernel
│   ├── install-kernel.ts  # Installation system
│   └── example.install.json  # Installation template
├── package.json
├── tsconfig.json
└── README.md
```

### Configuration Files
- `system.yml` - System version, hostname, timezone
- `security.yml` - Login attempts, password rules
- `network.yml` - Network settings
- `users.yml` - User accounts and permissions
- `.terminal` - Per-user terminal settings
- `.history` - Command history

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
- [Inquirer](https://github.com/SBoudrias/Inquirer.js) for interactive prompts
- [js-yaml](https://github.com/nodeca/js-yaml) for YAML configuration 