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
            const config = JSON.parse(data) as InstallConfig;

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
            'tmp'
        ];

        try {
            await Promise.all(
                directories.map(dir => 
                    mkdir(join(this.rootPath, dir), { recursive: true })
                )
            );

            // Create .terminal config file for the user
            await this.createTerminalConfig(this.config.user.username);

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
            await mkdir(join(this.rootPath, 'etc', 'system'), { recursive: true });
            await mkdir(join(this.rootPath, 'etc', 'security'), { recursive: true });
            await mkdir(join(this.rootPath, 'etc', 'network'), { recursive: true });
            await mkdir(join(this.rootPath, 'etc', 'users'), { recursive: true });
            await mkdir(join(this.rootPath, 'etc', 'sysconfig'), { recursive: true });
            await mkdir(join(this.rootPath, 'home', this.config.user.username), { recursive: true });
            await mkdir(join(this.rootPath, 'var', 'log'), { recursive: true });

            // Save system configuration
            const systemConfig = {
                version: '1.0.0',
                hostname: this.config.system.hostname,
                installDate: new Date().toISOString(),
                rootPath: this.rootPath,
                timezone: this.config.system.timezone,
                locale: this.config.system.locale
            };

            await writeFile(
                join(this.rootPath, 'etc', 'system', 'system.yml'),
                yaml.dump(systemConfig)
            );

            // Save security configuration
            const securityConfig = {
                maxLoginAttempts: 3,
                passwordMinLength: 8,
                allowedUsernameChars: 'a-zA-Z0-9_-',
                allowedHostnameChars: 'a-zA-Z0-9-',
                sessionTimeout: 3600,
                requireStrongPasswords: true
            };

            await writeFile(
                join(this.rootPath, 'etc', 'security', 'security.yml'),
                yaml.dump(securityConfig)
            );

            // Save network configuration
            const networkConfig = {
                hostname: this.config.system.hostname,
                domain: 'fileos.local',
                dns: ['8.8.8.8', '8.8.4.4'],
                interfaces: {
                    eth0: {
                        type: 'ethernet',
                        address: '192.168.1.100',
                        netmask: '255.255.255.0'
                    }
                }
            };

            await writeFile(
                join(this.rootPath, 'etc', 'network', 'network.yml'),
                yaml.dump(networkConfig)
            );

            // Save user configuration
            const userConfig = {
                users: [{
                    username: this.config.user.username,
                    passwordHash: createHash('sha256').update(this.config.user.password).digest('hex'),
                    rootPasswordHash: createHash('sha256').update(this.config.user.password).digest('hex'),
                    homeDir: join(this.rootPath, 'home', this.config.user.username),
                    created: new Date().toISOString(),
                    shell: '/bin/fos',
                    groups: ['users', 'admin']
                }],
                currentUser: this.config.user.username
            };

            await writeFile(
                join(this.rootPath, 'etc', 'users', 'users.yml'),
                yaml.dump(userConfig)
            );

            // Save sysconfig configuration
            const sysconfigConfig = {
                kernel: {
                    version: '1.0.0',
                    type: 'FileOS',
                    architecture: 'x64'
                },
                system: {
                    timezone: this.config.system.timezone,
                    locale: this.config.system.locale,
                    keyboard: 'us',
                    console: 'tty0'
                }
            };

            await writeFile(
                join(this.rootPath, 'etc', 'sysconfig', 'system.yml'),
                yaml.dump(sysconfigConfig)
            );

            // Create terminal configuration
            const terminalConfig = {
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
                    prompt_symbol: ">",
                    directory_color: "blue",
                    command_color: "green",
                    error_color: "red",
                    suggestion_color: "gray"
                },
                behavior: {
                    history_size: 1000,
                    suggestion_delay_ms: 100,
                    cache_ttl_ms: 5000,
                    max_suggestions: 5
                }
            };

            // Save terminal configuration
            await writeFile(
                join(this.rootPath, 'home', this.config.user.username, '.terminal'),
                JSON.stringify(terminalConfig, null, 2)
            );

            // Create history file
            await writeFile(
                join(this.rootPath, 'home', this.config.user.username, '.history'),
                '[]'
            );

        } catch (error) {
            throw new Error(`Failed to save configuration: ${error}`);
        }
    }

    private async validateInstallation(): Promise<boolean> {
        const requiredFiles = [
            'etc/system/system.yml',
            'etc/security/security.yml',
            'etc/network/network.yml',
            'etc/users/users.yml',
            'etc/sysconfig/system.yml'
        ];

        try {
            await Promise.all(requiredFiles.map(file => 
                stat(join(this.rootPath, file))
            ));
            return true;
        } catch {
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