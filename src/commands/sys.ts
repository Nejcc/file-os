import { SystemUpdater } from '../core/updater';
import { join } from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { readFile, writeFile, copyFile, mkdir } from 'fs/promises';

export class SystemCommands {
    private updater: SystemUpdater;
    private rootPath: string;

    constructor(rootPath: string) {
        this.rootPath = rootPath;
        this.updater = new SystemUpdater(rootPath);
    }

    private async copyKernelFiles(targetDir: string): Promise<void> {
        const files = [
            { source: join('kernel', 'kernel.ts'), dest: join('src', 'runtime-kernel.ts') },
            { source: join('kernel', 'commands', 'sys.ts'), dest: join('src', 'commands', 'sys.ts') },
            { source: join('kernel', 'core', 'updater.ts'), dest: join('src', 'core', 'updater.ts') },
            { source: join('kernel', 'core', 'installer.ts'), dest: join('src', 'core', 'installer.ts') },
            { source: join('kernel', 'install-kernel.ts'), dest: join('src', 'install-kernel.ts') }
        ];

        for (const file of files) {
            const sourcePath = join(this.rootPath, file.source);
            const destPath = join(targetDir, '..', file.dest);
            try {
                const content = await readFile(sourcePath, 'utf-8');
                // Update imports back to original paths
                const updatedContent = content
                    .replace(/from ['"]\.\/core\//g, 'from \'../core/')
                    .replace(/from ['"]\.\/commands\//g, 'from \'../commands/')
                    .replace(/from ['"]\.\//g, 'from \'./');
                await writeFile(destPath, updatedContent);
                console.log(chalk.green(`Updated ${file.dest}`));
            } catch (error) {
                console.error(chalk.yellow(`Warning: Could not update ${file.dest}`), error);
            }
        }
    }

    async update(args: string[]): Promise<void> {
        try {
            // Copy kernel files outside build directory
            await this.copyKernelFiles(this.rootPath);

            // Update system version
            const systemConfigPath = join(this.rootPath, 'etc', 'system', 'system.yml');
            const systemConfig = yaml.load(await readFile(systemConfigPath, 'utf-8')) as any;
            systemConfig.version = `${systemConfig.version.split('.')[0]}.${parseInt(systemConfig.version.split('.')[1]) + 1}.0`;
            await writeFile(systemConfigPath, yaml.dump(systemConfig));

            console.log(chalk.green(`System updated to version ${systemConfig.version}`));
            console.log(chalk.yellow('Please restart FileOS for changes to take effect'));
        } catch (error) {
            console.error(chalk.red('Update failed:'), error);
        }
    }

    async upgrade(args: string[]): Promise<void> {
        try {
            // Copy kernel files outside build directory
            await this.copyKernelFiles(this.rootPath);

            // Update system version (major version upgrade)
            const systemConfigPath = join(this.rootPath, 'etc', 'system', 'system.yml');
            const systemConfig = yaml.load(await readFile(systemConfigPath, 'utf-8')) as any;
            systemConfig.version = `${parseInt(systemConfig.version.split('.')[0]) + 1}.0.0`;
            await writeFile(systemConfigPath, yaml.dump(systemConfig));

            console.log(chalk.green(`System upgraded to version ${systemConfig.version}`));
            console.log(chalk.yellow('Please restart FileOS for changes to take effect'));
        } catch (error) {
            console.error(chalk.red('Upgrade failed:'), error);
        }
    }

    async check(args: string[]): Promise<void> {
        try {
            const systemConfigPath = join(this.rootPath, 'etc', 'system', 'system.yml');
            const systemConfigContent = await readFile(systemConfigPath, 'utf-8');
            const systemConfig = yaml.load(systemConfigContent) as any;
            
            console.log(chalk.cyan('Current System Information:'));
            console.log(`Version: ${chalk.green(systemConfig.version)}`);
            console.log(`Hostname: ${chalk.green(systemConfig.hostname)}`);
            console.log(`Installation Date: ${chalk.green(systemConfig.installation_date)}`);
            
            // Check kernel files
            const kernelFiles = [
                'kernel.ts',
                'commands/sys.ts',
                'core/updater.ts',
                'core/installer.ts',
                'install-kernel.ts'
            ];

            console.log(chalk.cyan('\nKernel Files:'));
            for (const file of kernelFiles) {
                try {
                    await readFile(join(this.rootPath, 'kernel', file), 'utf-8');
                    console.log(chalk.green(`✓ ${file}`));
                } catch {
                    console.log(chalk.red(`✗ ${file}`));
                }
            }
        } catch (error) {
            console.error(chalk.red('Failed to check system status:'), error);
        }
    }
} 