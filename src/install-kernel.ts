import { Command } from 'commander';
import chalk from 'chalk';
import { FileOSInstaller } from './core/installer';

const program = new Command();

program
    .name('fos-install')
    .description('FileOS Installation')
    .version('1.0.0')
    .option('-f, --force', 'Force reinstallation if already installed')
    .action(async () => {
        try {
            const installer = new FileOSInstaller();
            await installer.install();
        } catch (error) {
            console.error(chalk.red('Installation failed:'), error);
            process.exit(1);
        }
    });

program.parse(); 