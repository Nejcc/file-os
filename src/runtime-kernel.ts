import { Command } from 'commander';
import chalk from 'chalk';
import { readdir, stat, readFile, writeFile, mkdir, rm, rmdir } from 'fs/promises';
import { join, relative } from 'path';
import * as readline from 'readline';
import inquirer from 'inquirer';
import { createHash } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import yaml from 'js-yaml';
import path from 'path';
import { createInterface } from 'readline';
import { unlink } from 'fs/promises';
import { SystemCommands } from './commands/sys';

const execAsync = promisify(exec);

interface SystemConfig {
    version: string;
    hostname: string;
    installation_date: string;
    rootPath: string;
    timezone: string;
    locale: string;
}

interface SecurityConfig {
    maxLoginAttempts: number;
    passwordMinLength: number;
    allowedUsernameChars: string;
    allowedHostnameChars: string;
    sessionTimeout: number;
    requireStrongPasswords: boolean;
}

interface NetworkConfig {
    hostname: string;
    domain: string;
    dns: string[];
    interfaces: {
        [key: string]: {
            type: string;
            address: string;
            netmask: string;
        };
    };
}

interface UserConfig {
    users: Array<{
        username: string;
        passwordHash: string;
        rootPasswordHash: string;
        homeDir: string;
        created: string;
        shell: string;
        groups: string[];
    }>;
    currentUser: string;
}

interface SysConfig {
    kernel: {
        version: string;
        type: string;
        architecture: string;
    };
    system: {
        timezone: string;
        locale: string;
        keyboard: string;
        console: string;
    };
}

interface TerminalConfig {
    features: {
        autocompletion: boolean;
        autosuggestion: boolean;
        syntax_highlighting: boolean;
        command_validation: boolean;
        history_search: boolean;
        smart_quotes: boolean;
        auto_cd: boolean;
        show_hidden_files: boolean;
    };
    style: {
        prompt_symbol: string;
        directory_color: string;
        command_color: string;
        error_color: string;
        suggestion_color: string;
    };
    behavior: {
        history_size: number;
        suggestion_delay_ms: number;
        cache_ttl_ms: number;
        max_suggestions: number;
    };
}

// Cache for configuration files
interface ConfigCache {
    system: SystemConfig | null;
    security: SecurityConfig | null;
    network: NetworkConfig | null;
    user: UserConfig | null;
    sysconfig: SysConfig | null;
    lastModified: { [key: string]: number };
}

export class RuntimeKernel {
    private currentPath: string;
    private program: Command;
    private rl!: readline.Interface;
    private rootPath: string;
    private configCache: ConfigCache = {
        system: null,
        security: null,
        network: null,
        user: null,
        sysconfig: null,
        lastModified: {}
    };
    private loginAttempts: number = 0;
    private lastLoginTime: number = 0;
    private currentUser: string = '';
    private commandHistory: string[] = [];
    private maxHistorySize: number = 100;
    private directoryCache: Map<string, { items: string[], timestamp: number }> = new Map();
    private CACHE_TTL = 5000; // 5 seconds cache TTL
    private terminalConfig: TerminalConfig = {
        features: {
            autocompletion: true,
            autosuggestion: true,
            syntax_highlighting: true,
            command_validation: true,
            history_search: true,
            smart_quotes: false,
            auto_cd: true,
            show_hidden_files: false
        },
        style: {
            prompt_symbol: '>',
            directory_color: 'blue',
            command_color: 'green',
            error_color: 'red',
            suggestion_color: 'gray'
        },
        behavior: {
            history_size: 1000,
            suggestion_delay_ms: 100,
            cache_ttl_ms: 5000,
            max_suggestions: 5
        }
    };
    private lastSuggestion: string = '';
    private suggestionTimeout: NodeJS.Timeout | null = null;
    private systemCommands: SystemCommands;
    private skipLogin: boolean = false;
    private autoLoginUser: string | null = null;

    constructor(options: { skipLogin?: boolean; autoLoginUser?: string } = {}) {
        this.rootPath = join(process.cwd(), 'src', 'build');
        this.currentPath = this.rootPath;
        this.program = new Command();
        this.systemCommands = new SystemCommands(this.rootPath);
        this.skipLogin = options.skipLogin || false;
        this.autoLoginUser = options.autoLoginUser || null;
        this.initialize();
    }

    private initialize(): void {
        this.program
            .name('fos')
            .description('FileOS - Runtime Environment')
            .version('1.0.0');

        this.program
            .command('sys')
            .description('System management commands')
            .addCommand(
                new Command('update')
                    .description('Update the system')
                    .option('--revert', 'Revert to previous version')
                    .action(async (options) => {
                        await this.systemCommands.update(options.revert ? ['--revert'] : []);
                    })
            )
            .addCommand(
                new Command('upgrade')
                    .description('Upgrade the system to a new major version')
                    .action(async () => {
                        await this.systemCommands.upgrade([]);
                    })
            )
            .addCommand(
                new Command('check')
                    .description('Check system status and available updates')
                    .action(async () => {
                        await this.systemCommands.check([]);
                    })
            );

        this.program
            .command('sys check')
            .description('Check system status and available updates')
            .action(async (args) => {
                await this.systemCommands.check(args);
            });
    }

    private getPrompt(): string {
        const user = this.configCache.user?.currentUser || 'guest';
        const hostname = this.configCache.system?.hostname || 'fileos';
        const path = this.getDisplayPath();
        return `${user}@${hostname} ${path}${this.terminalConfig.style.prompt_symbol} `;
    }

    private getDisplayPath(): string {
        const relativePath = relative(this.rootPath, this.currentPath);
        return relativePath === '' ? '/' : '/' + relativePath;
    }

    private getCachedDirectoryContents(path: string): string[] | null {
        const cached = this.directoryCache.get(path);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.items;
        }
        return null;
    }

    private async updateDirectoryCache(path: string): Promise<string[]> {
        try {
            const items = await readdir(path);
            const itemsWithTypes = await Promise.all(
                items.map(async item => {
                    const fullPath = join(path, item);
                    try {
                        const stats = await stat(fullPath);
                        return stats.isDirectory() ? item + '/' : item;
                    } catch {
                        return item;
                    }
                })
            );
            this.directoryCache.set(path, {
                items: itemsWithTypes,
                timestamp: Date.now()
            });
            return itemsWithTypes;
        } catch {
            return [];
        }
    }

    private async loadConfigFile<T>(path: string, type: string): Promise<T | null> {
        try {
            const stats = await stat(path);
            const lastModified = stats.mtimeMs;

            // Check if we have a cached version that's still valid
            if (this.configCache.lastModified[path] === lastModified) {
                return this.configCache[type as keyof Omit<ConfigCache, 'lastModified'>] as T;
            }

            const data = await readFile(path, 'utf-8');
            const config = yaml.load(data) as T;
            
            // Update cache
            this.configCache[type as keyof Omit<ConfigCache, 'lastModified'>] = config as any;
            this.configCache.lastModified[path] = lastModified;

            return config;
        } catch (error) {
            console.error(chalk.red(`Error loading ${type} config:`), error);
            return null;
        }
    }

    private async loadConfig(): Promise<void> {
        try {
            const configPaths = {
                system: join(this.rootPath, 'etc', 'system', 'system.yml'),
                security: join(this.rootPath, 'etc', 'security', 'security.yml'),
                network: join(this.rootPath, 'etc', 'network', 'network.yml'),
                user: join(this.rootPath, 'etc', 'users', 'users.yml'),
                sysconfig: join(this.rootPath, 'etc', 'sysconfig', 'system.yml')
            };

            // Load all configurations in parallel
            const [system, security, network, user, sysconfig] = await Promise.all([
                this.loadConfigFile<SystemConfig>(configPaths.system, 'system'),
                this.loadConfigFile<SecurityConfig>(configPaths.security, 'security'),
                this.loadConfigFile<NetworkConfig>(configPaths.network, 'network'),
                this.loadConfigFile<UserConfig>(configPaths.user, 'user'),
                this.loadConfigFile<SysConfig>(configPaths.sysconfig, 'sysconfig')
            ]);

            if (!system || !security || !user) {
                throw new Error('Required configuration files are missing or invalid');
            }

            // Display system information
            console.log(chalk.cyan('\nFileOS System Information'));
            console.log(chalk.cyan('======================='));
            console.log(chalk.cyan(`Version: ${system.version}`));
            console.log(chalk.cyan(`Hostname: ${system.hostname}`));
            console.log(chalk.cyan(`Installation Date: ${new Date(system.installation_date).toLocaleString()}`));
            console.log(chalk.cyan(`Timezone: ${system.timezone}`));
            console.log(chalk.cyan(`Locale: ${system.locale}`));
            console.log();
        } catch (error) {
            console.error(chalk.red('Error loading configuration:'));
            console.log(chalk.yellow('Please run the installer first:'));
            console.log(chalk.cyan('npm run install-os'));
            process.exit(1);
        }
    }

    private async login(): Promise<boolean> {
        // Skip login if skipLogin is true
        if (this.skipLogin) {
            const userConfig = this.configCache.user;
            if (!userConfig?.users.length) {
                console.error(chalk.red('Configuration error. Please run the installer first.'));
                console.log(chalk.cyan('npm run install-os'));
                return false;
            }

            // Use autoLoginUser if provided, otherwise use first user
            const username = this.autoLoginUser || userConfig.users[0].username;
            const user = userConfig.users.find(u => u.username === username);
            if (!user) {
                console.error(chalk.red(`Auto-login user ${username} not found`));
                return false;
            }

            userConfig.currentUser = user.username;
            this.currentPath = user.homeDir;
            this.currentUser = user.username;
            this.lastLoginTime = Date.now();

            // Save updated user configuration
            try {
                await writeFile(
                    join(this.rootPath, 'etc', 'users', 'users.yml'),
                    yaml.dump(userConfig)
                );
            } catch (error) {
                console.error(chalk.yellow('Warning: Could not save user session'));
            }

            return true;
        }

        const userConfig = this.configCache.user;
        const securityConfig = this.configCache.security;

        if (!userConfig?.users.length || !securityConfig) {
            console.error(chalk.red('Configuration error. Please run the installer first.'));
            console.log(chalk.cyan('npm run install-os'));
            return false;
        }

        // Check session timeout
        const now = Date.now();
        if (this.lastLoginTime > 0 && 
            (now - this.lastLoginTime) / 1000 > securityConfig.sessionTimeout) {
            console.log(chalk.yellow('Session expired. Please login again.'));
            this.loginAttempts = 0;
        }

        if (this.loginAttempts >= securityConfig.maxLoginAttempts) {
            console.error(chalk.red('Too many login attempts. Please try again later.'));
            process.exit(1);
        }

        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'username',
                message: 'Username:',
                validate: (input: string) => {
                    if (!input.trim()) {
                        return 'Username cannot be empty';
                    }
                    if (!new RegExp(`^[${securityConfig.allowedUsernameChars}]+$`).test(input)) {
                        return `Username can only contain: ${securityConfig.allowedUsernameChars}`;
                    }
                    return true;
                }
            },
            {
                type: 'password',
                name: 'password',
                message: 'Password:',
                validate: (input: string) => {
                    if (!input) {
                        return 'Password cannot be empty';
                    }
                    if (input.length < securityConfig.passwordMinLength) {
                        return `Password must be at least ${securityConfig.passwordMinLength} characters long`;
                    }
                    return true;
                }
            }
        ]);

        const user = userConfig.users.find(u => u.username === answers.username);
        if (!user) {
            this.loginAttempts++;
            console.error(chalk.red('Invalid username or password'));
            console.log(chalk.yellow(`Remaining attempts: ${securityConfig.maxLoginAttempts - this.loginAttempts}`));
            return false;
        }

        const passwordHash = createHash('sha256').update(answers.password).digest('hex');
        if (passwordHash !== user.passwordHash) {
            this.loginAttempts++;
            console.error(chalk.red('Invalid username or password'));
            console.log(chalk.yellow(`Remaining attempts: ${securityConfig.maxLoginAttempts - this.loginAttempts}`));
            return false;
        }

        // Reset login attempts and update last login time
        this.loginAttempts = 0;
        this.lastLoginTime = now;
        
        // Update user configuration
        userConfig.currentUser = user.username;
        this.currentPath = user.homeDir;
        this.currentUser = user.username;

        // Save updated user configuration
        try {
            await writeFile(
                join(this.rootPath, 'etc', 'users', 'users.yml'),
                yaml.dump(userConfig)
            );
        } catch (error) {
            console.error(chalk.yellow('Warning: Could not save user session'));
        }

        return true;
    }

    private addToHistory(command: string) {
        this.commandHistory.push(command);
        if (this.commandHistory.length > this.maxHistorySize) {
            this.commandHistory.shift();
        }
        this.saveHistory().catch(() => {}); // Save history after each command
    }

    private async handleCommand(line: string) {
        if (!line.trim()) return;

        this.addToHistory(line.trim());
        const args = line.trim().split(/\s+/);
        const command = args[0];
        const subArgs = args.slice(1);

        try {
            // Handle sys commands first
            if (command === 'sys') {
                if (subArgs.length === 0) {
                    console.log(chalk.red('Error: sys requires a subcommand (update, upgrade, or check)'));
                    return;
                }
                const subCommand = subArgs[0];
                const subCommandArgs = subArgs.slice(1);
                switch (subCommand) {
                    case 'update':
                        await this.systemCommands.update(subCommandArgs);
                        return;
                    case 'upgrade':
                        await this.systemCommands.upgrade(subCommandArgs);
                        return;
                    case 'check':
                        await this.systemCommands.check(subCommandArgs);
                        return;
                    default:
                        console.log(chalk.red(`Unknown sys subcommand: ${subCommand}`));
                        console.log('Available subcommands: update, upgrade, check');
                        return;
                }
            }

            // Handle other commands
            switch (command) {
                case 'ls':
                    await this.listDirectory();
                    break;
                case 'll':
                    await this.listDirectoryDetails();
                    break;
                case 'cd':
                    await this.changeDirectory(subArgs[0] || '');
                    break;
                case 'pwd':
                    await this.printWorkingDirectory();
                    break;
                case 'whoami':
                    await this.showCurrentUser();
                    break;
                case 'hostname':
                    await this.showHostname();
                    break;
                case 'groups':
                    await this.showGroups();
                    break;
                case 'help':
                    this.showHelp();
                    break;
                case 'history':
                    await this.showHistory();
                    break;
                case 'mkdir':
                    if (subArgs.length === 0) {
                        console.log(chalk.red('Error: mkdir requires a directory name'));
                        break;
                    }
                    await this.makeDirectory(subArgs[0]);
                    break;
                case 'rm':
                    if (subArgs.length === 0) {
                        console.log(chalk.red('Error: rm requires a path'));
                        break;
                    }
                    await this.removeDirectory(subArgs[0], subArgs.includes('-r'));
                    break;
                case 'terminal':
                    if (subArgs[0] === 'config') {
                        if (subArgs[1] === 'edit') {
                            await this.editTerminalConfig();
                        } else {
                            await this.showTerminalConfig();
                        }
                    } else {
                        console.log(chalk.red('Error: Unknown terminal command'));
                    }
                    break;
                case 'where':
                    if (subArgs.length === 0) {
                        console.log(chalk.red('Error: where requires a filename'));
                        break;
                    }
                    await this.locateFile(subArgs[0]);
                    break;
                case 'nano':
                    if (subArgs.length === 0) {
                        console.log(chalk.red('Error: nano requires a filename'));
                        break;
                    }
                    await this.editFile(subArgs[0]);
                    break;
                case 'cat':
                    if (subArgs.length === 0) {
                        console.log(chalk.red('Error: cat requires a filename'));
                        break;
                    }
                    await this.catFile(subArgs[0]);
                    break;
                case 'touch':
                    if (subArgs.length === 0) {
                        console.log(chalk.red('Error: touch requires a filename'));
                        break;
                    }
                    await this.touchFile(subArgs[0]);
                    break;
                case 'echo':
                    await this.echo(subArgs);
                    break;
                case 'exit':
                    console.log('Exiting FileOS...');
                    console.log('Goodbye!');
                    process.exit(0);
                default:
                    console.log(chalk.red(`Unknown command: ${command}`));
                    console.log('Type "help" to see available commands.');
            }
        } catch (error) {
            console.error(chalk.red('Error:'), error);
        }
    }

    private showHistory() {
        console.log(chalk.cyan('\nCommand History:'));
        console.log(chalk.cyan('================'));
        this.commandHistory.forEach((cmd, index) => {
            console.log(chalk.white(`${index + 1}  ${cmd}`));
        });
    }

    private async listDirectory(): Promise<void> {
        try {
            const items = await readdir(this.currentPath);
            if (items.length === 0) {
                console.log(chalk.yellow('Directory is empty'));
                return;
            }
            
            const maxNameLength = Math.max(...items.map(item => item.length));
            for (const item of items) {
                const itemPath = join(this.currentPath, item);
                const stats = await stat(itemPath);
                const color = stats.isDirectory() ? chalk.blue : chalk.white;
                console.log(color(item.padEnd(maxNameLength + 2)));
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                console.log(chalk.yellow('Directory does not exist. Creating...'));
                try {
                    await mkdir(this.currentPath, { recursive: true });
                    console.log(chalk.green('Directory created successfully.'));
                    console.log(chalk.yellow('Directory is empty'));
                } catch (mkdirError) {
                    console.error(chalk.red('Failed to create directory:'), mkdirError);
                }
            } else {
                console.error(chalk.red('Error listing directory:'), error);
            }
        }
    }

    private async listDirectoryDetails(): Promise<void> {
        try {
            const items = await readdir(this.currentPath);
            if (items.length === 0) {
                console.log(chalk.yellow('Directory is empty'));
                return;
            }
            
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
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                console.log(chalk.yellow('Directory does not exist. Creating...'));
                try {
                    await mkdir(this.currentPath, { recursive: true });
                    console.log(chalk.green('Directory created successfully.'));
                    console.log(chalk.yellow('Directory is empty'));
                } catch (mkdirError) {
                    console.error(chalk.red('Failed to create directory:'), mkdirError);
                }
            } else {
                console.error(chalk.red('Error listing directory:'), error);
            }
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

    private async changeDirectory(path: string): Promise<void> {
        try {
            // Handle empty path or '~' to go to home directory
            if (!path || path === '~') {
                const user = this.configCache.user?.users.find(u => u.username === this.currentUser);
                if (user) {
                    this.currentPath = user.homeDir;
                    // Pre-cache the new directory contents
                    await this.updateDirectoryCache(this.currentPath);
                    this.updatePrompt();
                    console.log(chalk.green(`Changed directory to: ${this.getDisplayPath()}`));
                    return;
                }
            }

            // Handle absolute paths
            const newPath = path.startsWith('/') ? 
                join(this.rootPath, path.slice(1)) : 
                join(this.currentPath, path);
            
            // Check if trying to go outside root directory
            if (!newPath.startsWith(this.rootPath)) {
                console.error(chalk.red('Access denied: Cannot navigate outside root directory'));
                return;
            }

            const stats = await stat(newPath);
            if (stats.isDirectory()) {
                this.currentPath = newPath;
                // Pre-cache the new directory contents
                await this.updateDirectoryCache(this.currentPath);
                this.updatePrompt();
                console.log(chalk.green(`Changed directory to: ${this.getDisplayPath()}`));
            } else {
                console.error(chalk.red('Not a directory'));
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                const newPath = path.startsWith('/') ? 
                    join(this.rootPath, path.slice(1)) : 
                    join(this.currentPath, path);
                    
                console.log(chalk.yellow('Directory does not exist. Creating...'));
                try {
                    await mkdir(newPath, { recursive: true });
                    this.currentPath = newPath;
                    // Pre-cache the new directory contents
                    await this.updateDirectoryCache(this.currentPath);
                    this.updatePrompt();
                    console.log(chalk.green(`Created and changed to directory: ${this.getDisplayPath()}`));
                } catch (mkdirError) {
                    console.error(chalk.red('Failed to create directory:'), mkdirError);
                }
            } else {
                console.error(chalk.red('Error changing directory:'), error);
            }
        }
    }

    private showUserInfo() {
        const user = this.configCache.user?.users.find(u => u.username === this.currentUser);
        if (!user) {
            console.log(chalk.red('User not found'));
            return;
        }

        console.log(chalk.cyan('\nUser Information:'));
        console.log(chalk.cyan('================'));
        console.log(chalk.white(`Username: ${user.username}`));
        console.log(chalk.white(`Home Directory: ${user.homeDir}`));
        console.log(chalk.white(`Shell: ${user.shell}`));
        console.log(chalk.white(`Groups: ${user.groups.join(', ')}`));
        console.log(chalk.white(`Created: ${new Date(user.created).toLocaleString()}`));
    }

    private showHostname() {
        const hostname = this.configCache.system?.hostname;
        if (!hostname) {
            console.log(chalk.red('System configuration not loaded'));
            return;
        }

        console.log(chalk.cyan(`Hostname: ${hostname}`));
    }

    private showGroups() {
        const user = this.configCache.user?.users.find(u => u.username === this.currentUser);
        if (!user) {
            console.log(chalk.red('User not found'));
            return;
        }

        console.log(chalk.cyan(`Groups: ${user.groups.join(', ')}`));
    }

    private showHelp() {
        console.log(chalk.cyan('\nFileOS - Available Commands:'));
        console.log(chalk.cyan('========================\n'));
        
        const commands = [
            { cmd: 'ls', desc: 'List directory contents' },
            { cmd: 'll', desc: 'List directory contents with details' },
            { cmd: 'cd <path>', desc: 'Change current directory' },
            { cmd: 'pwd', desc: 'Print working directory' },
            { cmd: 'whoami', desc: 'Show current user' },
            { cmd: 'hostname', desc: 'Show or set system hostname' },
            { cmd: 'groups', desc: 'Show user groups' },
            { cmd: 'help', desc: 'Display this help information' },
            { cmd: 'exit', desc: 'Exit FileOS' },
            { cmd: 'history', desc: 'Show command history' },
            { cmd: 'mkdir <path>', desc: 'Create a new directory' },
            { cmd: 'mkdir -p <path>', desc: 'Create a new directory and its parents' },
            { cmd: 'rm <path>', desc: 'Remove an empty directory' },
            { cmd: 'rm -r <path>', desc: 'Remove directory and its contents' },
            { cmd: 'where <filename>', desc: 'Locate a file' },
            { cmd: 'nano <filename>', desc: 'Edit a file' },
            { cmd: 'cat <file>', desc: 'Display file contents' },
            { cmd: 'touch <file>', desc: 'Create an empty file' },
            { cmd: 'echo <text>', desc: 'Print text to console' },
            { cmd: 'echo <text> > <file>', desc: 'Write text to file' },
            { cmd: 'terminal config', desc: 'Show terminal configuration' },
            { cmd: 'terminal edit', desc: 'Edit terminal configuration' },
            { cmd: 'sys update', desc: 'Update system kernel' },
            { cmd: 'sys upgrade', desc: 'Upgrade system kernel' },
            { cmd: 'sys check', desc: 'Check system status' }
        ];

        const maxCmdLength = Math.max(...commands.map(c => c.cmd.length));
        
        commands.forEach(({ cmd, desc }) => {
            console.log(
                `${chalk.green(cmd.padEnd(maxCmdLength + 2))}${chalk.white(desc)}`
            );
        });
        console.log();
    }

    private completeCommand(line: string): [string[], string] {
        if (!this.terminalConfig.features.autocompletion) {
            return [[], ''];
        }

        const args = line.split(/\s+/);
        const lastArg = args[args.length - 1] || '';
        const commands = [
            'ls', 'll', 'cd', 'pwd', 'whoami', 'hostname', 'groups',
            'help', 'exit', 'history', 'mkdir', 'rm', 'where', 'nano',
            'cat', 'touch', 'echo', 'terminal', 'sys'
        ];

        // If no space after command, complete the command itself
        if (args.length === 1) {
            const hits = commands.filter(cmd => cmd.startsWith(lastArg));
            return [hits.length ? hits.slice(0, this.terminalConfig.behavior.max_suggestions) : [], lastArg];
        }

        // For commands that accept paths, complete the path
        const pathCommands = ['cd', 'mkdir', 'rm', 'ls', 'll', 'where', 'nano', 'cat', 'touch', 'echo'];
        if (pathCommands.includes(args[0])) {
            try {
                // Handle absolute paths
                let basePath = this.currentPath;
                let searchPath = lastArg;

                if (lastArg.startsWith('/')) {
                    basePath = this.rootPath;
                    searchPath = lastArg.slice(1);
                } else if (lastArg.startsWith('~/')) {
                    const user = this.configCache.user?.users.find(u => u.username === this.currentUser);
                    if (user) {
                        basePath = user.homeDir;
                        searchPath = lastArg.slice(2);
                    }
                }

                const lastSlashIndex = searchPath.lastIndexOf('/');
                if (lastSlashIndex !== -1) {
                    basePath = join(basePath, searchPath.slice(0, lastSlashIndex));
                    searchPath = searchPath.slice(lastSlashIndex + 1);
                }

                // Use cached directory contents if available
                const cachedItems = this.getCachedDirectoryContents(basePath);
                if (cachedItems) {
                    const items = this.terminalConfig.features.show_hidden_files ? 
                        cachedItems : 
                        cachedItems.filter(item => !item.startsWith('.'));
                    const hits = items
                        .filter(item => item.startsWith(searchPath))
                        .slice(0, this.terminalConfig.behavior.max_suggestions);
                    return [hits.length ? hits : [], lastArg];
                }

                // If not in cache, trigger an async update for next time
                this.updateDirectoryCache(basePath).catch(() => {});
                return [[], lastArg];
            } catch {
                return [[], lastArg];
            }
        }

        // Add system command completions
        if (args[0] === 'sys') {
            const sysCommands = ['update', 'upgrade', 'check'];
            if (args.length === 2) {
                const hits = sysCommands.filter(cmd => cmd.startsWith(lastArg));
                return [hits.length ? hits.slice(0, this.terminalConfig.behavior.max_suggestions) : [], lastArg];
            }
        }

        return [[], lastArg];
    }

    private updatePrompt() {
        this.rl.setPrompt(this.getPrompt());
    }

    private async makeDirectory(path: string): Promise<void> {
        try {
            // Handle -p flag
            if (path === '-p') {
                console.error(chalk.red('mkdir: missing directory argument'));
                return;
            }

            const targetPath = path.startsWith('/') ? 
                join(this.rootPath, path.slice(1)) : 
                join(this.currentPath, path);

            // Check if trying to create outside root directory
            if (!targetPath.startsWith(this.rootPath)) {
                console.error(chalk.red('Access denied: Cannot create directory outside root directory'));
                return;
            }

            await mkdir(targetPath, { recursive: true });
            console.log(chalk.green(`Created directory: ${path}`));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
                console.error(chalk.red(`Directory already exists: ${path}`));
            } else {
                console.error(chalk.red('Error creating directory:'), error);
            }
        }
    }

    private async removeDirectory(path: string, recursive: boolean = false): Promise<void> {
        try {
            const targetPath = path.startsWith('/') ? 
                join(this.rootPath, path.slice(1)) : 
                join(this.currentPath, path);

            // Check if trying to remove outside root directory
            if (!targetPath.startsWith(this.rootPath)) {
                console.error(chalk.red('Access denied: Cannot remove directory outside root directory'));
                return;
            }

            // Prevent removing the root directory
            if (targetPath === this.rootPath) {
                console.error(chalk.red('Cannot remove root directory'));
                return;
            }

            // Prevent removing the current directory
            if (targetPath === this.currentPath) {
                console.error(chalk.red('Cannot remove current directory'));
                return;
            }

            const stats = await stat(targetPath);
            if (!stats.isDirectory()) {
                console.error(chalk.red('Not a directory'));
                return;
            }

            if (recursive) {
                await rm(targetPath, { recursive: true, force: true });
                console.log(chalk.green(`Removed directory and its contents: ${path}`));
            } else {
                // Check if directory is empty
                const items = await readdir(targetPath);
                if (items.length > 0) {
                    console.error(chalk.red('Directory is not empty. Use -r to remove recursively'));
                    return;
                }
                await rmdir(targetPath);
                console.log(chalk.green(`Removed directory: ${path}`));
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                console.error(chalk.red(`Directory not found: ${path}`));
            } else {
                console.error(chalk.red('Error removing directory:'), (error as Error).message);
            }
        }
    }

    private async showTerminalConfig(): Promise<void> {
        console.log(chalk.cyan('\nTerminal Configuration:'));
        console.log(chalk.cyan('=====================\n'));
        console.log(JSON.stringify(this.terminalConfig, null, 2));
        console.log('\nTo edit, use: terminal edit');
    }

    private async editTerminalConfig(): Promise<void> {
        try {
            const configPath = path.join(this.rootPath, 'home', this.currentUser, '.terminal');
            const config = await readFile(configPath, 'utf-8');
            
            // Create a temporary file for editing
            const tempPath = path.join(this.rootPath, 'home', this.currentUser, '.terminal.tmp');
            await writeFile(tempPath, config);
            
            // Show the current configuration
            console.log('\nCurrent configuration:');
            console.log(config);
            
            // Prompt for changes
            const rl = createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const newConfig = await new Promise<string>((resolve) => {
                rl.question('\nEnter new configuration (or press Enter to keep current): ', (answer) => {
                    resolve(answer);
                });
            });

            rl.close();

            if (newConfig.trim()) {
                // Validate JSON
                try {
                    JSON.parse(newConfig);
                    await writeFile(configPath, newConfig);
                    console.log('Configuration updated successfully.');
                } catch (error) {
                    console.log('Invalid JSON configuration. Changes not saved.');
                }
            } else {
                console.log('No changes made.');
            }

            // Clean up temporary file
            await unlink(tempPath);
        } catch (error) {
            console.log('Error editing configuration:', error);
        }
    }

    private async loadTerminalConfig(): Promise<void> {
        try {
            const user = this.configCache.user?.users.find(u => u.username === this.currentUser);
            if (!user) return;

            const configPath = join(user.homeDir, '.terminal');
            const configData = await readFile(configPath, 'utf-8');
            const config = JSON.parse(configData) as TerminalConfig;

            // Merge with defaults, keeping user settings
            this.terminalConfig = {
                features: { ...this.terminalConfig.features, ...config.features },
                style: { ...this.terminalConfig.style, ...config.style },
                behavior: { ...this.terminalConfig.behavior, ...config.behavior }
            };

            // Update cache TTL from config
            this.CACHE_TTL = this.terminalConfig.behavior.cache_ttl_ms;
            
            // Update history size
            this.maxHistorySize = this.terminalConfig.behavior.history_size;

        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.error(chalk.yellow('Warning: Could not load terminal configuration'), error);
            }
        }
    }

    private getColor(color: string): chalk.ChalkFunction {
        switch (color.toLowerCase()) {
            case 'red': return chalk.red;
            case 'green': return chalk.green;
            case 'blue': return chalk.blue;
            case 'yellow': return chalk.yellow;
            case 'magenta': return chalk.magenta;
            case 'cyan': return chalk.cyan;
            case 'white': return chalk.white;
            case 'gray': return chalk.gray;
            default: return chalk.white;
        }
    }

    private formatCommand(line: string): string {
        if (!this.terminalConfig.features.syntax_highlighting) {
            return line;
        }

        const args = line.split(/\s+/);
        if (args[0] === '') return line;

        const commandColor = this.getColor(this.terminalConfig.style.command_color);
        const directoryColor = this.getColor(this.terminalConfig.style.directory_color);
        const errorColor = this.getColor(this.terminalConfig.style.error_color);

        // Color the command
        args[0] = commandColor(args[0]);

        // Color directories in arguments
        for (let i = 1; i < args.length; i++) {
            if (args[i].includes('/')) {
                args[i] = directoryColor(args[i]);
            }
        }

        return args.join(' ');
    }

    private async showSuggestion(line: string): Promise<void> {
        if (!this.terminalConfig.features.autosuggestion) return;

        if (this.suggestionTimeout) {
            clearTimeout(this.suggestionTimeout);
        }

        this.suggestionTimeout = setTimeout(async () => {
            const args = line.split(/\s+/);
            if (args[0] === '') return;

            // Get command suggestions
            const commands = [
                'ls', 'll', 'cd', 'pwd', 'whoami', 'hostname', 'groups',
                'help', 'exit', 'history', 'mkdir', 'rm', 'terminal'
            ];

            const matchingCommands = commands.filter(cmd => 
                cmd.startsWith(args[0]) && cmd !== args[0]
            );

            if (matchingCommands.length > 0) {
                this.lastSuggestion = matchingCommands[0];
                const suggestionColor = this.getColor(this.terminalConfig.style.suggestion_color);
                process.stdout.write(suggestionColor(this.lastSuggestion.slice(args[0].length)));
                process.stdout.write('\r');
                process.stdout.write(this.getPrompt() + this.formatCommand(line));
            } else {
                this.lastSuggestion = '';
            }
        }, this.terminalConfig.behavior.suggestion_delay_ms);
    }

    private validateCommand(line: string): boolean {
        if (!this.terminalConfig.features.command_validation) return true;

        const args = line.split(/\s+/);
        if (args[0] === '') return true;

        const validCommands = [
            'ls', 'll', 'cd', 'pwd', 'whoami', 'hostname', 'groups',
            'help', 'exit', 'history', 'mkdir', 'rm', 'terminal'
        ];

        if (!validCommands.includes(args[0])) {
            const errorColor = this.getColor(this.terminalConfig.style.error_color);
            console.error(errorColor(`Unknown command: ${args[0]}`));
            console.log(chalk.cyan('Type "help" to see available commands.'));
            return false;
        }

        return true;
    }

    private searchHistory(query: string): string[] {
        if (!this.terminalConfig.features.history_search) return [];

        return this.commandHistory
            .filter(cmd => cmd.includes(query))
            .slice(-this.terminalConfig.behavior.max_suggestions);
    }

    private handleKeyPress(str: string, key: readline.Key): void {
        if (key.name === 'tab' && this.lastSuggestion) {
            // Accept suggestion
            const currentLine = this.rl.line;
            const args = currentLine.split(/\s+/);
            if (args[0] === this.lastSuggestion.slice(0, args[0].length)) {
                this.rl.write(this.lastSuggestion.slice(args[0].length));
                this.lastSuggestion = '';
            }
        } else if (key.name === 'up' || key.name === 'down') {
            // History navigation
            if (this.terminalConfig.features.history_search) {
                const currentLine = this.rl.line;
                const historyMatches = this.searchHistory(currentLine);
                
                if (historyMatches.length > 0) {
                    const currentIndex = historyMatches.indexOf(currentLine);
                    let newIndex = currentIndex + (key.name === 'up' ? 1 : -1);
                    
                    if (newIndex < 0) newIndex = historyMatches.length - 1;
                    if (newIndex >= historyMatches.length) newIndex = 0;
                    
                    this.rl.write(null, { ctrl: true, name: 'u' }); // Clear line
                    this.rl.write(historyMatches[newIndex]);
                }
            }
        }
    }

    private async locateFile(filename: string): Promise<void> {
        try {
            const searchPath = this.currentPath;
            const found = await this.searchFile(searchPath, filename);
            
            if (found) {
                console.log(`Found: ${found}`);
            } else {
                console.log(`File not found: ${filename}`);
            }
        } catch (error) {
            console.log('Error searching for file:', error);
        }
    }

    private async searchFile(dir: string, filename: string): Promise<string | null> {
        try {
            const entries = await readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.name === filename) {
                    return fullPath;
                }
                
                if (entry.isDirectory()) {
                    const found = await this.searchFile(fullPath, filename);
                    if (found) return found;
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    private async editFile(filepath: string): Promise<void> {
        try {
            const fullPath = path.join(this.currentPath, filepath);
            
            if (!await this.isPathInRoot(fullPath)) {
                console.log('Error: Cannot edit files outside root directory');
                return;
            }

            let content = '';
            try {
                content = await readFile(fullPath, 'utf-8');
            } catch (error) {
                // File doesn't exist, that's okay
            }

            // Show current content
            console.log('\nCurrent content:');
            console.log(content);
            
            // Prompt for changes
            const rl = createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const newContent = await new Promise<string>((resolve) => {
                rl.question('\nEnter new content (or press Enter to keep current): ', (answer) => {
                    resolve(answer);
                });
            });

            rl.close();

            if (newContent.trim()) {
                await writeFile(fullPath, newContent);
                console.log('File updated successfully.');
            } else {
                console.log('No changes made.');
            }
        } catch (error) {
            console.log('Error editing file:', error);
        }
    }

    private async isPathInRoot(filePath: string): Promise<boolean> {
        try {
            const relativePath = path.relative(this.rootPath, filePath);
            return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
        } catch (error) {
            return false;
        }
    }

    private async catFile(filepath: string): Promise<void> {
        try {
            const fullPath = path.join(this.currentPath, filepath);
            
            if (!await this.isPathInRoot(fullPath)) {
                console.log('Error: Cannot read files outside root directory');
                return;
            }

            const content = await readFile(fullPath, 'utf-8');
            console.log(content);
        } catch (error) {
            console.log('Error reading file:', error);
        }
    }

    private async touchFile(filepath: string): Promise<void> {
        try {
            const fullPath = path.join(this.currentPath, filepath);
            
            if (!await this.isPathInRoot(fullPath)) {
                console.log('Error: Cannot create files outside root directory');
                return;
            }

            await writeFile(fullPath, '', { flag: 'a' });
            console.log(`Created file: ${filepath}`);
        } catch (error) {
            console.log('Error creating file:', error);
        }
    }

    private async echo(args: string[]): Promise<void> {
        if (args.length === 0) {
            console.log();
            return;
        }

        const outputIndex = args.indexOf('>');
        if (outputIndex === -1) {
            console.log(args.join(' '));
            return;
        }

        if (outputIndex === args.length - 1) {
            console.log(chalk.red('Error: No output file specified'));
            return;
        }

        const text = args.slice(0, outputIndex).join(' ');
        const filePath = join(this.currentPath, args[outputIndex + 1]);

        try {
            await writeFile(filePath, text);
        } catch (error) {
            console.error(chalk.red('Error writing to file:'), error);
        }
    }

    private async loadHistory(): Promise<void> {
        try {
            const user = this.configCache.user?.users.find(u => u.username === this.currentUser);
            if (!user) return;

            const historyPath = join(user.homeDir, '.history');
            const historyData = await readFile(historyPath, 'utf-8');
            this.commandHistory = JSON.parse(historyData);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.error(chalk.yellow('Warning: Could not load command history'), error);
            }
        }
    }

    private async saveHistory(): Promise<void> {
        try {
            const user = this.configCache.user?.users.find(u => u.username === this.currentUser);
            if (!user) return;

            const historyPath = join(user.homeDir, '.history');
            await writeFile(historyPath, JSON.stringify(this.commandHistory));
        } catch (error) {
            console.error(chalk.yellow('Warning: Could not save command history'), error);
        }
    }

    private async printWorkingDirectory(): Promise<void> {
        console.log(this.getDisplayPath());
    }

    private async showCurrentUser(): Promise<void> {
        console.log(this.currentUser);
    }

    public async start() {
        await this.loadConfig();

        // Require login before proceeding
        let loggedIn = false;
        while (!loggedIn) {
            loggedIn = await this.login();
        }

        // Load terminal configuration and history after successful login
        await this.loadTerminalConfig();
        await this.loadHistory();

        // Initialize readline interface after successful login
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: this.getPrompt(),
            completer: (line: string) => this.completeCommand(line)
        });

        // Handle keypress events
        process.stdin.on('keypress', (str, key) => {
            this.handleKeyPress(str, key);
        });

        console.log(chalk.cyan('\nWelcome to FileOS!'));
        console.log(chalk.cyan('Type "help" for available commands.'));
        console.log(chalk.cyan('Use TAB for command and path completion.'));
        console.log(chalk.cyan('Type "terminal config" to view terminal settings.'));
        
        this.rl.prompt();
        
        this.rl.on('line', async (line) => {
            // Clear any pending suggestion
            if (this.suggestionTimeout) {
                clearTimeout(this.suggestionTimeout);
                this.suggestionTimeout = null;
            }
            this.lastSuggestion = '';

            // Validate command if enabled
            if (!this.validateCommand(line)) {
                this.rl.prompt();
                return;
            }

            await this.handleCommand(line);
            this.rl.prompt();
        }).on('close', () => {
            console.log(chalk.yellow('Goodbye!'));
            process.exit(0);
        });

        // Enable keypress events
        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
    }
}

// Start the runtime kernel with options
const options = {
    skipLogin: process.argv.includes('--skip-login'),
    autoLoginUser: process.argv.find(arg => arg.startsWith('--auto-login='))?.split('=')[1]
};
const runtime = new RuntimeKernel(options);
runtime.start(); 