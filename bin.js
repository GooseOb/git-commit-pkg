#!/usr/bin/env node

import { exec } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

const print = (msg, writer = process.stdout) => {
	writer.write(`\x1b[35m[git-commit-pkg]\x1b[0m ${msg}\n`);
};

if (process.argv.includes('-v') || process.argv.includes('--version')) {
	print(
		JSON.parse(await readFile(path.join(import.meta.dirname, 'package.json')))
			.version
	);
	process.exit(0);
}

const git = (cmd) =>
	new Promise((resolve, reject) => {
		exec('git ' + cmd, (err, stdout, stderr) => {
			if (err) {
				reject(err);
			} else {
				resolve({ stdout, stderr });
			}
		});
	});

if (process.argv.length < 3) {
	print('No arguments passed');
	process.exit(1);
}

const paramsArr = process.argv.slice(2);

const msgIndex =
	paramsArr.findIndex((item) => item === '-m' || item === '-am') + 1;

let msg;
if (msgIndex) {
	msg = paramsArr[msgIndex];
	paramsArr[msgIndex] = `'${msg}'`;
} else {
	print('No commit message passed');
	process.exit(1);
}

const is = {
	committing: false,
	inputProcessing: true,
};

const TEMP_FILE_PATH = path.resolve('.git', 'commit-pkg');

const commit = async () => {
	is.committing = true;
	await writeFile(TEMP_FILE_PATH, '');
	let commitResult;
	try {
		commitResult = await git('commit ' + paramsArr.join(' '));
	} catch (e) {
		print(e, process.stderr);
		printOptions('An error occurred', [
			['try again', commit],
			['exit', () => unlink(TEMP_FILE_PATH).then(() => process.exit(1))],
		]);
		return;
	}
	await unlink(TEMP_FILE_PATH);
	is.committing = false;
	if (commitResult.stderr) print(commitResult.stderr);
	print(commitResult.stdout);
	openPushMenu();
};

const moveMenuCursor = (step) => {
	process.stdout.clearLine();
	process.stdout.write('  ' + options.names[options.currIndex]);
	options.currIndex += step;
	if (options.currIndex === -1) {
		options.currIndex = options.length - 1;
		step += options.length;
	} else if (options.currIndex === options.length) {
		options.currIndex = 0;
		step += -options.length;
	}
	process.stdout.moveCursor(0, step);
	const option = options[options.currIndex];
	process.stdout.cursorTo(0);
	process.stdout.write(
		`> \x1b[34;4m${
			option[0] + (option[2] ? '\x1b[0;90m ' + option[2] : '')
		}\x1b[0m`
	);
	process.stdout.cursorTo(0);
};

let options;
const printOptions = (msg, arr) => {
	options = arr;
	options.names = arr.map((item) => item[0]);
	options.currIndex = 0;
	print(msg + '\n' + options.names.join('\n  '));
	process.stdout.moveCursor(0, -arr.length);
	moveMenuCursor(0);
	is.inputProcessing = true;
};

const openPushMenu = () => {
	printOptions('Make a push?', [
		['no', () => process.exit(0)],
		[
			'yes',
			() =>
				git('push').then(
					({ stdout, stderr }) => {
						if (stdout) print(stdout);
						if (stderr) print(stderr, process.stderr);
						process.exit(0);
					},
					(err) => {
						print(err, process.stderr);
						process.exit(1);
					}
				),
		],
	]);
};

const onTerminate = async () => {
	if (is.committing) {
		await unlink('.git/index.lock').catch(() => {});
		await unlink(TEMP_FILE_PATH);
		print('Deleted temporary files');
		printOptions('Undo the version change?', [
			[
				'yes',
				() =>
					updateVersion(vOriginal).then(() => {
						process.exit(0);
					}),
			],
			[
				'no',
				() => {
					process.exit(0);
				},
			],
		]);
	} else {
		process.exit(0);
	}
};

process.on('SIGINT', onTerminate);

if (/\[(?:skip ci|ci skip)]/i.test(msg)) {
	await commit();
} else {
	const pkg = JSON.parse(await readFile('package.json', 'utf8'));

	const vOption = (label, version) => [
		label,
		() => {
			pkg.version = version;
			return writeFile(
				'package.json',
				JSON.stringify(pkg, null, '\t') + '\n',
				'utf8'
			).then(() => {
				print('Updated the version to ' + pkg.version);
			});
		},
		version,
	];

	const [, vMajor, vMinor, vPatch, vPreType, vPre] = pkg.version.match(
		/(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?/
	);

	const mainOptions = [vOption('no change', pkg.version)];
	if (vPreType) {
		const vBase = `${vMajor}.${vMinor}.${vPatch}`;
		mainOptions.push(
			vOption('prerelease', `${vBase}-${vPreType}.${vPre ? +vPre + 1 : 1}`),
			vOption('release', vBase)
		);
		if (vPreType === 'alpha') {
			mainOptions.push(vOption('prerelease - beta', `${vBase}-beta.1`));
		}
	} else {
		mainOptions.push(
			vOption('patch release', `${vMajor}.${vMinor}.${+vPatch + 1}`),
			vOption('minor release', `${vMajor}.${+vMinor + 1}.0`),
			vOption('major release', `${+vMajor + 1}.0.0`)
		);
	}

	mainOptions.push(
		[
			'skip ci',
			() => {
				paramsArr[msgIndex] = `'[skip ci] ${msg}'`;
				print('Added [skip ci] to the commit message');
			},
		],
		[
			'cancel',
			() => {
				print('Canceled');
				process.exit(0);
			},
		]
	);

	if (
		JSON.parse((await git('show main:package.json')).stdout).version !==
		pkg.version
	) {
		await commit();
	} else {
		printOptions(
			'Version hasn’t been changed and there is no [skip ci] in the commit message',
			mainOptions
		);
	}
}

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on(
	'data',
	/** @param key {string} */
	async (key) => {
		if (key === '\u0003') {
			if (is.inputProcessing)
				process.stdout.moveCursor(0, options.length - options.currIndex);
			print('Terminated by Ctrl+C');
			await onTerminate();
		}
		if (!is.inputProcessing) return;
		if (key === '\u000D' || key === ' ') {
			is.inputProcessing = false;
			process.stdout.moveCursor(0, options.length - options.currIndex);
			await options[options.currIndex][1]();
			await commit();
		}
		if (/^\u001B\u005B/.test(key)) {
			const char = key[2];
			if (char === '\u0041' || char === '\u0044') {
				moveMenuCursor(-1);
			} else if (char === '\u0042' || char === '\u0043') {
				moveMenuCursor(1);
			}
		}
	}
);
