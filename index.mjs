#!/usr/bin/env node

import fs from 'fs';
import inquirer from 'inquirer';
import https from 'https';
import ora from 'ora';
import { promisify } from 'util';
import { Command } from 'commander';

const program = new Command();

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);

program
    .name('wp-version-updater')
    .description('A tool to update WordPress plugin versions.')
    .version('1.0.0')
    .parse(process.argv);

const getCurrentVersion = async () => {
    const readme = await readFile('readme.txt', 'utf8');
    const versionMatch = readme.match(/Stable tag:\s*(\S+)/i);
    if (!versionMatch) {
        throw new Error('Current version not found in readme.txt');
    }
    return versionMatch[1];
};

const promptVersionUpdate = async (currentVersion) => {
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    console.log(`Current version is ${major}.${minor}.${patch}`);

    const choices = [
        { name: `Patch - ${currentVersion} => ${major}.${minor}.${patch + 1}`, value: 'patch' },
        { name: `Minor - ${currentVersion} => ${major}.${minor + 1}.0`, value: 'minor' },
        { name: `Major - ${currentVersion} => ${major + 1}.0.0`, value: 'major' }
    ];

    const { versionType } = await inquirer.prompt([
        {
            type: 'list',
            name: 'versionType',
            message: 'Select version type to update:',
            choices
        }
    ]);

    let newVersion;
    switch (versionType) {
        case 'major':
            newVersion = `${major + 1}.0.0`;
            break;
        case 'minor':
            newVersion = `${major}.${minor + 1}.0`;
            break;
        case 'patch':
            newVersion = `${major}.${minor}.${patch + 1}`;
            break;
    }

    return newVersion;
};

const getPluginSlug = async () => {
    const pluginFiles = await readdir('.');
    for (const file of pluginFiles.filter(file => file.endsWith('.php'))) {
        const content = await readFile(file, 'utf8');
        const slugMatch = content.match(/Text Domain:\s*(\S+)/i);
        if (slugMatch) {
            return slugMatch[1].toLowerCase();
        }
    }
    throw new Error('Text Domain not found in any PHP files');
};

const fetchLatestVersion = async (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, (resp) => {
            let data = '';
            resp.on('data', chunk => data += chunk);
            resp.on('end', () => resolve(JSON.parse(data)));
            resp.on('error', reject);
        });
    });
};

const getLatestVersions = async () => {
    const wordpressUrl = 'https://api.wordpress.org/core/version-check/1.7/';
    const woocommerceUrl = 'https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=woocommerce';
    const spinner = ora('Fetching latest versions...').start();

    try {
        const [wordpressData, woocommerceData] = await Promise.all([
            fetchLatestVersion(wordpressUrl),
            fetchLatestVersion(woocommerceUrl)
        ]);

        const latestWordPressVersion = wordpressData.offers[0].version.split('.').slice(0, 2).join('.');
        const latestWooCommerceVersion = woocommerceData.version;

        spinner.succeed('Fetched latest versions');

        return {
            wordpress: latestWordPressVersion,
            woocommerce: latestWooCommerceVersion
        };
    } catch (error) {
        spinner.fail('Error fetching versions');
        console.error(`Error fetching versions: ${error}`);

        const { latestWordPressVersion } = await inquirer.prompt({
            type: 'input',
            name: 'latestWordPressVersion',
            message: 'Could not fetch latest WordPress version. Please enter it manually (e.g., 6.5): '
        });

        const { latestWooCommerceVersion } = await inquirer.prompt({
            type: 'input',
            name: 'latestWooCommerceVersion',
            message: 'Could not fetch latest WooCommerce version. Please enter it manually (e.g., 9.0.2): '
        });

        return {
            wordpress: latestWordPressVersion,
            woocommerce: latestWooCommerceVersion
        };
    }
};

const updateFileContent = async (filePath, replacements) => {
    let content = await readFile(filePath, 'utf8');
    replacements.forEach(({ regex, value }) => {
        content = content.replace(regex, value);
    });
    await writeFile(filePath, content);
};

const updatePluginFiles = async (version, slug, latestVersions) => {
    const spinner = ora('Updating plugin files...').start();

    await updateFileContent('readme.txt', [
        { regex: /(Stable tag:\s*)\S+/i, value: `$1${version}` },
        { regex: /(Tested up to:\s*)\S+/i, value: `$1${latestVersions.wordpress}` },
        { regex: /(WC tested up to:\s*)\S+/i, value: `$1${latestVersions.woocommerce}` }
    ]);

    await updateFileContent(`${slug}.php`, [
        { regex: /(Version:\s*)\S+/i, value: `$1${version}` },
        { regex: /(Stable tag:\s*)\S+/i, value: `$1${version}` },
        { regex: /(Tested up to:\s*)\S+/i, value: `$1${latestVersions.wordpress}` },
        { regex: /(WC tested up to:\s*)\S+/i, value: `$1${latestVersions.woocommerce}` },
        { regex: /define\(\s*'(\w+_VERSION)',\s*'\S+'\s*\)/g, value: `define('$1', '${version}')` }
    ]);

    spinner.succeed('Plugin files updated successfully');
    console.log(`Updated readme.txt and ${slug}.php to version ${version}`);
};

const main = async () => {
    try {
        const currentVersion = await getCurrentVersion();
        const newVersion = await promptVersionUpdate(currentVersion);
        const slug = await getPluginSlug();
        const latestVersions = await getLatestVersions();
        await updatePluginFiles(newVersion, slug, latestVersions);
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
};

main();
