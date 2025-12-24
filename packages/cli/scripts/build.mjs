import path from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import shell from 'shelljs';
import { rawTimeZones } from '@vvo/tzdb';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const timezones = ['Etc/UTC', 'Etc/GMT', ...rawTimeZones.map((tz) => tz.name)];
const data = timezones.sort().reduce((acc, name) => {
	acc[name] = name.replaceAll('_', ' ');
	return acc;
}, {});
writeFileSync(path.resolve(ROOT_DIR, 'dist/timezones.json'), JSON.stringify({ data }));

const publicApiDirectory = path.resolve(ROOT_DIR, 'dist', 'public-api', 'v1');
if (!existsSync(publicApiDirectory)) {
	console.log('Creating directory', publicApiDirectory);
	mkdirSync(publicApiDirectory, { recursive: true });
}
const publicApiDir = path.resolve(ROOT_DIR, 'src', 'public-api');

shell
	.find(publicApiDir)
	.reduce((acc, cur) => {
		return cur.endsWith('openapi.yml') ? [...acc, path.relative('./src', cur)] : acc;
	}, [])
	.forEach((specPath) => {
		const distSpecPath = path.resolve(ROOT_DIR, 'dist', specPath);
		const command = `pnpm openapi bundle "src/${specPath}" --output "${distSpecPath}"`;

		shell.exec(command, { silent: true });
	});
