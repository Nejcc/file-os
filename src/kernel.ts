import { Command } from 'commander';
import chalk from 'chalk';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import * as readline from 'readline';

class FileOS {
    private currentPath: string;
    private program: Command;
    private rl: readline.Interface;
    private readonly rootPath: string;

    constructor() {
        this.rootPath = join(process.cwd(), 'src');
        this.currentPath = this.rootPath;
        this.program = new Command();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.green('fos> ')
        });
        this.initialize();
    }

    private initialize() {
        this.program
            .name('fos')
            .description('FileOS - A file/folder based operating system')
            .version('0.1.0');

        // Basic commands
        this.program
            .command('ls')
            .description('List directory contents')
            .action(this.listDirectory.bind(this));

        this.program
            .command('ll')
            .description('List directory contents with details')
            .action(this.listDirectoryDetailed.bind(this));

        this.program
            .command('cd <path>')
            .description('Change current directory')
            .action(this.changeDirectory.bind(this));

        this.program
            .command('pwd')
            .description('Print working directory')
            .action(() => {
                console.log(chalk.blue(this.currentPath));
            });

        this.program
            .command('exit')
            .description('Exit FileOS')
            .action(() => {
                console.log(chalk.yellow('Exiting FileOS...'));
                this.rl.close();
                process.exit(0);
            });
    }

    private async listDirectory() {
        try {
            const items = await readdir(this.currentPath);
            for (const item of items) {
                const itemPath = join(this.currentPath, item);
                const stats = await stat(itemPath);
                const color = stats.isDirectory() ? chalk.blue : chalk.white;
                console.log(color(item));
            }
        } catch (error) {
            console.error(chalk.red('Error listing directory:'), error);
        }
    }

    private async listDirectoryDetailed() {
        try {
            const items = await readdir(this.currentPath);
            const maxNameLength = Math.max(...items.map(item => item.length));
            
            for (const item of items) {
                const itemPath = join(this.currentPath, item);
                const stats = await stat(itemPath);
                const isDir = stats.isDirectory();
                const type = isDir ? 'DIR' : 'FILE';
                const color = isDir ? chalk.blue : chalk.white;
                
                const size = stats.size;
                const sizeStr = isDir ? '--' : this.formatSize(size);
                const date = stats.mtime.toLocaleString();
                
                console.log(
                    `${color(type.padEnd(4))} ` +
                    `${color(item.padEnd(maxNameLength + 2))} ` +
                    `${chalk.yellow(sizeStr.padStart(10))} ` +
                    `${chalk.gray(date)}`
                );
            }
        } catch (error) {
            console.error(chalk.red('Error listing directory:'), error);
        }
    }

    private formatSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    private async changeDirectory(path: string) {
        try {
            const newPath = join(this.currentPath, path);
            
            // Check if trying to go outside src directory
            if (!newPath.startsWith(this.rootPath)) {
                console.error(chalk.red('Access denied: Cannot navigate outside src directory'));
                return;
            }

            const stats = await stat(newPath);
            if (stats.isDirectory()) {
                this.currentPath = newPath;
                console.log(chalk.green(`Changed directory to: ${this.currentPath}`));
            } else {
                console.error(chalk.red('Not a directory'));
            }
        } catch (error) {
            console.error(chalk.red('Error changing directory:'), error);
        }
    }

    private async handleCommand(line: string) {
        const args = line.trim().split(/\s+/);
        if (args[0] === '') return;
        
        try {
            await this.program.parseAsync(['', '', ...args]);
        } catch (error) {
            console.error(chalk.red('Error executing command:'), error);
        }
    }

    public start() {
        console.log(chalk.cyan('Welcome to FileOS!'));
        console.log(chalk.cyan('Type "exit" to quit or "help" for available commands.'));
        console.log(chalk.cyan(`Current directory: ${this.currentPath}`));
        
        this.rl.prompt();
        
        this.rl.on('line', async (line) => {
            await this.handleCommand(line);
            this.rl.prompt();
        }).on('close', () => {
            console.log(chalk.yellow('Goodbye!'));
            process.exit(0);
        });
    }
}

// Start FileOS
const fos = new FileOS();
fos.start(); 