import { readFile, writeFile, mkdir, copyFile, stat, readdir, rm } from 'fs/promises';
import { join, relative } from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { createHash } from 'crypto';

interface UpdateManifest {
    version: string;
    files: {
        source: string;
        destination: string;
        type: 'file' | 'directory';
        hash?: string;
    }[];
    dependencies?: {
        [key: string]: string;
    };
    migrations?: {
        version: string;
        script: string;
    }[];
}

interface BackupInfo {
    timestamp: string;
    version: string;
    path: string;
}

export class SystemUpdater {
    private rootPath: string;
    private backupPath: string;
    private corePath: string;
    private backupInfoPath: string;

    constructor(rootPath: string) {
        this.rootPath = rootPath;
        this.backupPath = join(rootPath, 'var', 'backup');
        this.corePath = join(rootPath, '..', 'core');
        this.backupInfoPath = join(this.backupPath, 'backup-info.yml');
    }

    private async loadBackupInfo(): Promise<BackupInfo[]> {
        try {
            const content = await readFile(this.backupInfoPath, 'utf-8');
            return yaml.load(content) as BackupInfo[];
        } catch {
            return [];
        }
    }

    private async saveBackupInfo(backups: BackupInfo[]): Promise<void> {
        await writeFile(this.backupInfoPath, yaml.dump(backups));
    }

    private async backupSystem(version: string): Promise<string> {
        try {
            await mkdir(this.backupPath, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = join(this.backupPath, `backup-${timestamp}`);
            await mkdir(backupDir, { recursive: true });

            // Backup system configuration
            const configDirs = ['system', 'security', 'network', 'users'];
            for (const dir of configDirs) {
                const source = join(this.rootPath, 'etc', dir);
                const dest = join(backupDir, 'etc', dir);
                await mkdir(dest, { recursive: true });
                await this.copyDirectory(source, dest);
            }

            // Backup user data
            const usersDir = join(this.rootPath, 'home');
            const usersBackupDir = join(backupDir, 'home');
            await mkdir(usersBackupDir, { recursive: true });
            await this.copyDirectory(usersDir, usersBackupDir);

            // Save backup info
            const backups = await this.loadBackupInfo();
            backups.push({
                timestamp,
                version,
                path: backupDir
            });
            await this.saveBackupInfo(backups);

            console.log(chalk.green('System backup created successfully.'));
            return backupDir;
        } catch (error) {
            console.error(chalk.red('Error creating backup:'), error);
            throw error;
        }
    }

    private async copyDirectory(source: string, destination: string): Promise<void> {
        const entries = await readdir(source, { withFileTypes: true });
        await mkdir(destination, { recursive: true });

        for (const entry of entries) {
            const srcPath = join(source, entry.name);
            const destPath = join(destination, entry.name);

            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            } else {
                await copyFile(srcPath, destPath);
            }
        }
    }

    private async verifyFileHash(filePath: string, expectedHash: string): Promise<boolean> {
        try {
            const content = await readFile(filePath);
            const hash = createHash('sha256').update(content).digest('hex');
            return hash === expectedHash;
        } catch {
            return false;
        }
    }

    private async applyUpdate(manifest: UpdateManifest): Promise<void> {
        console.log(chalk.cyan(`Applying update to version ${manifest.version}...`));

        for (const file of manifest.files) {
            const sourcePath = join(this.corePath, file.source);
            const destPath = join(this.rootPath, file.destination);

            try {
                // Verify file integrity if hash is provided
                if (file.hash && !await this.verifyFileHash(sourcePath, file.hash)) {
                    throw new Error(`Hash verification failed for ${file.source}`);
                }

                if (file.type === 'directory') {
                    await mkdir(destPath, { recursive: true });
                    await this.copyDirectory(sourcePath, destPath);
                } else {
                    await mkdir(join(destPath, '..'), { recursive: true });
                    await copyFile(sourcePath, destPath);
                }

                console.log(chalk.green(`Updated: ${file.destination}`));
            } catch (error) {
                console.error(chalk.red(`Error updating ${file.destination}:`), error);
                throw error;
            }
        }

        // Run migrations if any
        if (manifest.migrations) {
            for (const migration of manifest.migrations) {
                console.log(chalk.cyan(`Running migration ${migration.version}...`));
                // TODO: Implement migration script execution
            }
        }
    }

    public async update(revert: boolean = false): Promise<void> {
        try {
            if (revert) {
                await this.revertUpdate();
                return;
            }

            console.log(chalk.cyan('Starting system update...'));

            // Read update manifest from core
            const manifestPath = join(this.corePath, 'update.yml');
            const manifestContent = await readFile(manifestPath, 'utf-8');
            const manifest = yaml.load(manifestContent) as UpdateManifest;

            // Create backup
            await this.backupSystem(manifest.version);

            // Apply update
            await this.applyUpdate(manifest);

            // Update system version
            const systemConfigPath = join(this.rootPath, 'etc', 'system', 'system.yml');
            const systemConfig = yaml.load(await readFile(systemConfigPath, 'utf-8')) as any;
            systemConfig.version = manifest.version;
            await writeFile(systemConfigPath, yaml.dump(systemConfig));

            console.log(chalk.green('System update completed successfully!'));
        } catch (error) {
            console.error(chalk.red('Update failed:'), error);
            throw error;
        }
    }

    public async upgrade(): Promise<void> {
        try {
            console.log(chalk.cyan('Starting system upgrade...'));

            // Read upgrade manifest from core
            const manifestPath = join(this.corePath, 'upgrade.yml');
            const manifestContent = await readFile(manifestPath, 'utf-8');
            const manifest = yaml.load(manifestContent) as UpdateManifest;

            // Verify major version change
            const systemConfigPath = join(this.rootPath, 'etc', 'system', 'system.yml');
            const systemConfig = yaml.load(await readFile(systemConfigPath, 'utf-8')) as any;
            const currentVersion = systemConfig.version.split('.')[0];
            const newVersion = manifest.version.split('.')[0];

            if (currentVersion === newVersion) {
                throw new Error('This is not a major version upgrade. Use "sys update" instead.');
            }

            // Create backup
            await this.backupSystem(manifest.version);

            // Apply upgrade
            await this.applyUpdate(manifest);

            // Update system version
            systemConfig.version = manifest.version;
            await writeFile(systemConfigPath, yaml.dump(systemConfig));

            console.log(chalk.green('System upgrade completed successfully!'));
        } catch (error) {
            console.error(chalk.red('Upgrade failed:'), error);
            throw error;
        }
    }

    private async revertUpdate(): Promise<void> {
        try {
            const backups = await this.loadBackupInfo();
            if (backups.length === 0) {
                throw new Error('No backups available to revert to');
            }

            // Get the most recent backup
            const latestBackup = backups[backups.length - 1];
            console.log(chalk.cyan(`Reverting to version ${latestBackup.version}...`));

            // Restore system configuration
            const configDirs = ['system', 'security', 'network', 'users'];
            for (const dir of configDirs) {
                const source = join(latestBackup.path, 'etc', dir);
                const dest = join(this.rootPath, 'etc', dir);
                await this.copyDirectory(source, dest);
            }

            // Restore user data
            const usersSource = join(latestBackup.path, 'home');
            const usersDest = join(this.rootPath, 'home');
            await this.copyDirectory(usersSource, usersDest);

            // Update system version
            const systemConfigPath = join(this.rootPath, 'etc', 'system', 'system.yml');
            const systemConfig = yaml.load(await readFile(systemConfigPath, 'utf-8')) as any;
            systemConfig.version = latestBackup.version;
            await writeFile(systemConfigPath, yaml.dump(systemConfig));

            // Remove the backup from the list
            backups.pop();
            await this.saveBackupInfo(backups);

            console.log(chalk.green('System reverted successfully!'));
        } catch (error) {
            console.error(chalk.red('Revert failed:'), error);
            throw error;
        }
    }
} 