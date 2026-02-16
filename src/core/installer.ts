import { mkdir, writeFile, access, rm, readFile, stat } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { createHash } from 'crypto';
import yaml from 'js-yaml';

interface InstallConfig {
    system: {
        hostname: string;
        timezone: string;
        locale: string;
        keyboard: string;
        console: string;
    };
    user: {
        username: string;
        password: string;
        rootPassword: string;
        shell: string;
        groups: string[];
    };
    network: {
        domain: string;
        dns: string[];
        interfaces: {
            name: string;
            type: string;
            address: string;
            netmask: string;
            gateway: string;
        }[];
    };
    security: {
        maxLoginAttempts: number;
        sessionTimeout: number;
        passwordMinLength: number;
        allowedUsernameChars: string;
    };
    sysconfig: {
        kernelVersion: string;
        kernelType: string;
        architecture: string;
    };
}

export class FileOSInstaller {
    private rootPath: string;
    private config: InstallConfig | null = null;

    constructor() {
        this.rootPath = join(process.cwd(), 'src', 'build');
    }

    private async checkExistingInstallation(): Promise<boolean> {
        try {
            await stat(join(this.rootPath, 'etc', 'system', 'system.yml'));
            return true;
        } catch {
            return false;
        }
    }

    private async loadInstallConfig(): Promise<InstallConfig | null> {
        try {
            const configPath = join(process.cwd(), 'src', 'install.json');
            const data = await readFile(configPath, 'utf-8');
            const jsonConfig = JSON.parse(data);

            // Convert the JSON format to our InstallConfig format
            const config: InstallConfig = {
                system: {
                    hostname: jsonConfig.system.hostname,
                    timezone: jsonConfig.system.timezone,
                    locale: jsonConfig.system.locale,
                    keyboard: jsonConfig.system.keyboard,
                    console: jsonConfig.system.console
                },
                user: {
                    username: jsonConfig.user.username,
                    password: jsonConfig.user.password,
                    rootPassword: jsonConfig.user.rootPassword,
                    shell: jsonConfig.user.shell,
                    groups: jsonConfig.user.groups
                },
                network: {
                    domain: jsonConfig.network.domain,
                    dns: jsonConfig.network.dns,
                    interfaces: [{
                        name: 'eth0',
                        type: jsonConfig.network.interfaces.eth0.type,
                        address: jsonConfig.network.interfaces.eth0.address,
                        netmask: jsonConfig.network.interfaces.eth0.netmask,
                        gateway: ''
                    }]
                },
                security: {
                    maxLoginAttempts: jsonConfig.security.maxLoginAttempts,
                    sessionTimeout: jsonConfig.security.sessionTimeout,
                    passwordMinLength: jsonConfig.security.passwordMinLength,
                    allowedUsernameChars: jsonConfig.security.allowedUsernameChars
                },
                sysconfig: {
                    kernelVersion: jsonConfig.sysconfig.kernel.version,
                    kernelType: jsonConfig.sysconfig.kernel.type,
                    architecture: jsonConfig.sysconfig.kernel.architecture
                }
            };

            // Validate required fields
            if (!config.system?.hostname || !config.user?.username || 
                !config.user?.password || !config.user?.rootPassword) {
                console.log(chalk.yellow('Warning: Some required fields are missing in install.json'));
                return null;
            }

            return config;
        } catch (error) {
            console.log(chalk.yellow('No install.json found or invalid format'));
            return null;
        }
    }

    private async promptForConfig(): Promise<InstallConfig> {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'hostname',
                message: 'Enter system hostname:',
                default: 'nox',
                validate: (input: string) => {
                    if (!input.trim()) return 'Hostname cannot be empty';
                    return true;
                }
            },
            {
                type: 'input',
                name: 'username',
                message: 'Enter username:',
                default: 'neo',
                validate: (input: string) => {
                    if (!input.trim()) return 'Username cannot be empty';
                    return true;
                }
            },
            {
                type: 'password',
                name: 'password',
                message: 'Enter user password:',
                validate: (input: string) => {
                    if (!input) return 'Password cannot be empty';
                    if (input.length < 8) return 'Password must be at least 8 characters long';
                    return true;
                }
            },
            {
                type: 'password',
                name: 'rootPassword',
                message: 'Enter root password:',
                validate: (input: string) => {
                    if (!input) return 'Password cannot be empty';
                    if (input.length < 8) return 'Password must be at least 8 characters long';
                    return true;
                }
            }
        ]);

        return {
            system: {
                hostname: answers.hostname,
                timezone: 'UTC',
                locale: 'en_US.UTF-8',
                keyboard: 'us',
                console: 'tty1'
            },
            user: {
                username: answers.username,
                password: answers.password,
                rootPassword: answers.rootPassword,
                shell: '/bin/bash',
                groups: ['users', 'wheel']
            },
            network: {
                domain: 'local',
                dns: ['8.8.8.8', '8.8.4.4'],
                interfaces: [{
                    name: 'eth0',
                    type: 'dhcp',
                    address: '',
                    netmask: '',
                    gateway: ''
                }]
            },
            security: {
                maxLoginAttempts: 3,
                sessionTimeout: 3600,
                passwordMinLength: 8,
                allowedUsernameChars: 'a-zA-Z0-9_-'
            },
            sysconfig: {
                kernelVersion: '1.0.0',
                kernelType: 'monolithic',
                architecture: 'x86_64'
            }
        };
    }

    private async createTerminalConfig(username: string): Promise<void> {
        const terminalConfig = {
            features: {
                autocompletion: true,
                autosuggestion: true,
                syntax_highlighting: true,
                command_validation: true,
                history_search: true,
                smart_quotes: false,
                auto_cd: true,  // automatically cd into directory if typed without cd
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

        const userHomeDir = join(this.rootPath, 'home', username);
        const terminalConfigPath = join(userHomeDir, '.terminal');
        
        try {
            await writeFile(terminalConfigPath, JSON.stringify(terminalConfig, null, 2));
            console.log(chalk.green('Created terminal configuration file'));
        } catch (error) {
            console.error(chalk.yellow('Warning: Could not create terminal configuration file'), error);
        }
    }

    private async createDirectoryStructure(): Promise<void> {
        if (!this.config) {
            throw new Error('Configuration is not initialized');
        }

        const directories = [
            'bin',
            'etc',
            'etc/security',
            'etc/system',
            'etc/network',
            'etc/users',
            'etc/sysconfig',
            'home',
            `home/${this.config.user.username}`,
            'var',
            'var/log',
            'var/run',
            'var/lib',
            'var/backup',
            'tmp',
            'kernel',
            'kernel/commands',
            'kernel/core'
        ];

        try {
            await Promise.all(
                directories.map(dir => 
                    mkdir(join(this.rootPath, dir), { recursive: true })
                )
            );

            // Copy all source files to kernel directory
            const filesToCopy = [
                { source: join('src', 'runtime-kernel.ts'), dest: join('kernel', 'kernel.ts') },
                { source: join('src', 'commands', 'sys.ts'), dest: join('kernel', 'commands', 'sys.ts') },
                { source: join('src', 'core', 'updater.ts'), dest: join('kernel', 'core', 'updater.ts') },
                { source: join('src', 'core', 'installer.ts'), dest: join('kernel', 'core', 'installer.ts') },
                { source: join('src', 'install-kernel.ts'), dest: join('kernel', 'install-kernel.ts') }
            ];

            await Promise.all(
                filesToCopy.map(async file => {
                    const sourcePath = join(process.cwd(), file.source);
                    const destPath = join(this.rootPath, file.dest);
                    try {
                        let content = await readFile(sourcePath, 'utf-8');
                        
                        // Update imports based on file location and type
                        const isCommand = file.dest.includes('commands/');
                        const isCore = file.dest.includes('core/');
                        const isKernel = file.dest === 'kernel/kernel.ts';

                        // Fix relative imports for commands
                        if (isCommand) {
                            content = content
                                .replace(/from ['"]\.\.\/core\//g, 'from \'../core/')
                                .replace(/from ['"]\.\.\/utils\//g, 'from \'../utils/')
                                .replace(/from ['"]\.\.\//g, 'from \'../');
                        }
                        // Fix relative imports for core modules
                        else if (isCore) {
                            content = content
                                .replace(/from ['"]\.\.\/commands\//g, 'from \'../commands/')
                                .replace(/from ['"]\.\.\/utils\//g, 'from \'../utils/')
                                .replace(/from ['"]\.\.\//g, 'from \'../');
                        }
                        // Fix relative imports for kernel
                        else if (isKernel) {
                            content = content
                                .replace(/from ['"]\.\/commands\//g, 'from \'./commands/')
                                .replace(/from ['"]\.\/core\//g, 'from \'./core/')
                                .replace(/from ['"]\.\/utils\//g, 'from \'./utils/');
                        }

                        await writeFile(destPath, content);
                        console.log(chalk.green(`Installed ${file.dest}`));
                    } catch (error) {
                        console.error(chalk.yellow(`Warning: Could not copy file ${file.source}`), error);
                    }
                })
            );

            // Create .terminal config file for the user
            await this.createTerminalConfig(this.config.user.username);

            // Create empty history file
            const historyPath = join(this.rootPath, 'home', this.config.user.username, '.history');
            await writeFile(historyPath, JSON.stringify([]));

            console.log(chalk.green('Created directory structure'));
        } catch (error) {
            throw new Error(`Failed to create directory structure: ${error}`);
        }
    }

    private async saveConfig(): Promise<void> {
        try {
            if (!this.config) {
                throw new Error('Configuration is not initialized');
            }

            // Create necessary directories
            await this.createDirectoryStructure();

            // Save system configuration
            const systemConfig = {
                version: this.config.sysconfig.kernelVersion,
                hostname: this.config.system.hostname,
                installation_date: new Date().toISOString(),
                timezone: this.config.system.timezone,
                locale: this.config.system.locale,
                keyboard: this.config.system.keyboard,
                console: this.config.system.console
            };
            await writeFile(
                join(this.rootPath, 'etc', 'system', 'system.yml'),
                yaml.dump(systemConfig)
            );

            // Save user configuration
            const userConfig = {
                users: [{
                    username: this.config.user.username,
                    passwordHash: createHash('sha256').update(this.config.user.password).digest('hex'),
                    rootPasswordHash: createHash('sha1').update(this.config.user.rootPassword).digest('hex'),
                    homeDir: join(this.rootPath, 'home', this.config.user.username),
                    created: new Date().toISOString(),
                    shell: this.config.user.shell,
                    groups: this.config.user.groups
                }],
                currentUser: this.config.user.username
            };
            await writeFile(
                join(this.rootPath, 'etc', 'users', 'users.yml'),
                yaml.dump(userConfig)
            );

            // Save security configuration
            const securityConfig = {
                maxLoginAttempts: this.config.security.maxLoginAttempts,
                passwordMinLength: this.config.security.passwordMinLength,
                allowedUsernameChars: this.config.security.allowedUsernameChars,
                allowedHostnameChars: "a-zA-Z0-9-",
                sessionTimeout: this.config.security.sessionTimeout,
                requireStrongPasswords: true
            };
            await writeFile(
                join(this.rootPath, 'etc', 'security', 'security.yml'),
                yaml.dump(securityConfig)
            );

            // Save network configuration
            const networkConfig = {
                hostname: this.config.system.hostname,
                domain: this.config.network.domain,
                dns: this.config.network.dns,
                interfaces: {
                    eth0: {
                        type: this.config.network.interfaces[0].type,
                        address: this.config.network.interfaces[0].address,
                        netmask: this.config.network.interfaces[0].netmask
                    }
                }
            };
            await writeFile(
                join(this.rootPath, 'etc', 'network', 'network.yml'),
                yaml.dump(networkConfig)
            );

            // Save sysconfig configuration
            const sysconfigConfig = {
                kernel: {
                    version: this.config.sysconfig.kernelVersion,
                    type: this.config.sysconfig.kernelType,
                    architecture: this.config.sysconfig.architecture
                },
                system: {
                    timezone: this.config.system.timezone,
                    locale: this.config.system.locale,
                    keyboard: this.config.system.keyboard,
                    console: this.config.system.console
                }
            };
            await writeFile(
                join(this.rootPath, 'etc', 'sysconfig', 'system.yml'),
                yaml.dump(sysconfigConfig)
            );

            console.log(chalk.green('Configuration files created successfully'));
        } catch (error) {
            throw new Error(`Failed to save configuration: ${error}`);
        }
    }

    private async validateInstallation(): Promise<boolean> {
        try {
            // Check if required directories exist
            const requiredDirs = [
                'bin',
                'etc',
                'etc/security',
                'etc/system',
                'etc/network',
                'etc/users',
                'home',
                'var',
                'var/log'
            ];

            for (const dir of requiredDirs) {
                const dirPath = join(this.rootPath, dir);
                try {
                    await stat(dirPath);
                } catch {
                    console.error(chalk.red(`Missing required directory: ${dir}`));
                    return false;
                }
            }

            // Check if required configuration files exist
            const requiredFiles = [
                'etc/system/system.yml',
                'etc/security/security.yml',
                'etc/network/network.yml',
                'etc/users/users.yml'
            ];

            for (const file of requiredFiles) {
                const filePath = join(this.rootPath, file);
                try {
                    await stat(filePath);
                } catch {
                    console.error(chalk.red(`Missing required file: ${file}`));
                    return false;
                }
            }

            // Check if user home directory exists
            if (this.config) {
                const userHomeDir = join(this.rootPath, 'home', this.config.user.username);
                try {
                    await stat(userHomeDir);
                } catch {
                    console.error(chalk.red(`Missing user home directory: ${userHomeDir}`));
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error(chalk.red('Error validating installation:'), error);
            return false;
        }
    }

    public async install(): Promise<void> {
        try {
            if (await this.checkExistingInstallation()) {
                console.log(chalk.yellow('FileOS is already installed.'));
                return;
            }

            this.config = await this.loadInstallConfig();
            if (!this.config) {
                this.config = await this.promptForConfig();
            }

            await this.createDirectoryStructure();
            await this.saveConfig();

            if (!await this.validateInstallation()) {
                throw new Error('Installation validation failed');
            }

            console.log(chalk.green('\nFileOS Installation Complete'));
            console.log(chalk.green('========================='));
            console.log(chalk.cyan(`Hostname: ${this.config.system.hostname}`));
            console.log(chalk.cyan(`Root Directory: ${this.rootPath}`));
            console.log(chalk.cyan(`User Home: ${join(this.rootPath, 'home', this.config.user.username)}`));
            console.log(chalk.cyan(`Installation Date: ${new Date().toLocaleString()}`));
            console.log(chalk.yellow('\nTo start FileOS, run:'));
            console.log(chalk.cyan('npm run start'));
        } catch (error) {
            console.error(chalk.red('Installation failed:'), error);
            process.exit(1);
        }
    }
} 