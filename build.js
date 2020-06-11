const { writeFileSync, readFileSync, existsSync, readdirSync, statSync, unlinkSync } = require('fs');
const { join, dirname, extname, basename, delimiter } = require('path');
const { spawn, execSync } = require('child_process');
const perf = require('perf_hooks').performance;
const chokidar   = require('chokidar');
const indent     = require('indent.js');
const sass       = require('sass');
const rtlcss     = require('rtlcss');
const rollup     = require('rollup');
const Terser     = require('terser');
const livereload = require('livereload');

colors();
const log = console.log;
const args = process.argv.slice(2);

if (args.length) {
	args.includes('js')         ? runJs() :
	args.includes('html')       ? runHtml() :
	args.includes('sass')       ? runSass(0) :
	args.includes('temp')       ? runTemp() :
	args.includes('rtl')        ? runRtlcss() :
	args.includes('toggleLive') ? toggleManualLivereload() :
	args.includes('release')    ? release() :
	args.includes('debug')      ? debug() :
	undefined;
} else {
	watch('public/js/**/*.js', runJs);
	watch('html/**/*', runHtml);
	runSass(); // watch('./scss/**/*', runSass);
	watch('template/**/*.htm', runTemp);
	watchFile('public/css/style.css', runRtlcss);
	live();
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// js
function runJs() {
	const t = perf.now();
	const depGraph = getDependencyGraph('public/js/main.js').map(i=>i.replace('public/','')).reverse();
	
	const modulepreloads = depGraph.map(i => '<link rel="modulepreload" href="${g.root}/'+i+'" />').join('\n');
	const app = depGraph.map(i => '<script type="module" src="${g.root}/'+i+'"></script>').join('\n');
	
	const live = existsSync('.livereload') ? '\n'+ readFileSync('.livereload', 'utf8') : '';
	
	writeFileSync('html/link-modulepreload.htm', modulepreloads);
	writeFileSync('html/script-app.htm', app + live);
	log('Ran js.'.green, (perf.now()-t).toFixed().yellow, 'ms'.yellow);
}
function getDependencyGraph(entry, files, result=[]) {
	if (entry) files = [entry = join(entry)];
	for (const file of files) {
		const content = readFileSync(file, 'utf8');
		const matchesIterator = content.matchAll(/import.+from\s+'(.+)'/g);
		let matches = [];
		for (const match of matchesIterator) {
			const groups = match.slice(1).map( i => join(dirname(file), i) );
			matches.push(...groups);
		}
		if (matches.length) {
			result.push(...matches);
			getDependencyGraph(undefined, matches, result);
		}
	}
	if (entry) return [entry, ...new Set(result)].map(i => i.replace(/\\/g, '/'));
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// html
function runHtml(globals={root: '.'}) {
	const t = perf.now();
	const srcdir     = './html';
	const outFile     = './public/index.html';
	const tempFile    = 'index.htm';
	const dataFileExt = '.htm';
	const tree = dirTree(srcdir, dataFileExt, tempFile);
	const html = parseAndRender(tree, {tempFile, dataFileExt, globals});
	if (!html) return;
	writeFileSync(outFile, indent.html(html, {tabString: '  '}), 'utf8');
	log('Ran html.'.green, (perf.now()-t).toFixed().yellow, 'ms'.yellow);
}
function parseAndRender(node, settings) {
	const dirs = getDirs(node);
	if (dirs.length) {
		dirs.forEach(k => {
			if (getDirs(node[k]).length) {
				node[k] = parseAndRender(node[k], settings);
			} else {
				// node[k] = render(node[k], settings);
				const rendered = render(node[k], settings);
				node[k] = () => rendered;
			}
		});
	}
	return render(node, settings);
}
function getDirs(node) {
	return Object.keys(node).filter(k => Object.prototype.toString.call(node[k]) === '[object Object]');
}
function render(node, settings) {
	const files     = Object.keys(node).filter( k => ['function','string'].includes(typeof node[k]) );
	const tempFile  = files.find(k => k === settings.tempFile);
	const dataFiles = files.filter(k => (!extname(k) || extname(k) === settings.dataFileExt) && k !== settings.tempFile);
	const g = settings.globals;
	let result = '';
	if (tempFile) {
		const context = dataFiles.reduce((a,c) => (a[c.replace(extname(c), '')] = node[c](g)) && a, {});
		result = node[tempFile](context, g);
	} else {
		result = dataFiles.reduce((a,c) => a += node[c](g)+'\n', '');
	}
	return result;
}
function dirTree(dir, dataFileExt, tempFile, tree={}) {
	readdirSync(dir).forEach(file => {
		const path = join(dir, file);
		if ( statSync(path).isDirectory() ) {
			tree[file] = {};
			dirTree(path, dataFileExt, tempFile, tree[file]);
		} else {
			tree[file] = extname(file) === dataFileExt && file !== tempFile
				? eval("(g={}) => `"+ readFileSync(path, 'utf8') +"`") // ? readFileSync(path, 'utf8')
				: eval("(c={}, g={}) => `"+ readFileSync(path, 'utf8') +"`");
		}
	});
	return tree;
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// sass
function runSass(w=true) {
	spawn('sass scss/style.scss:public/css/style.css', [w?'--watch':''], {shell:true,stdio:'inherit'});
	/* const outFile = './public/css/style.css';
	let err;
	try {
		const result = sass.renderSync({file: './scss/style.scss', outFile, sourceMap: true});
		writeFileSync(outFile, result.css.toString());
	} catch (error) {
		log(error.message.redB);
		err = true;
	}
	log('Ran sass.'[err ? 'red' : 'green']); */
}
// rtlcss
function runRtlcss() {
	const t = perf.now();
	// writeFileSync('./public/css/style-rtl.css', rtlcss.process(readFileSync('./public/css/style.css', 'utf8')));
	const input  = 'public/css/style.css';
	const output = 'public/css/style-rtl.css';
	const css = readFileSync(input, 'utf8');
	const result = rtlcss.configure({map:true}).process(css, { from: input, to: output, map: {inline: false} });
	writeFileSync(output, result);
	writeFileSync(output+'.map', result.map);
	log('Ran rtlcss.'.green, (perf.now()-t).toFixed().yellow, 'ms'.yellow);
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// templates
function runTemp() {
	const t = perf.now();
	const files = getFiles('template/');
	const partials = files.filter( i => /\.p\.htm$/.test(i) );
	const templates = files.filter( i => !/\.p\.htm$/.test(i) );
	
	let str = '(() => {\n';
	str += 'const [p,t] = [{},{}];\n';
	str += 'window._templates = t;\n';
	partials.forEach(path => {
		const key = path.replace('template/', '').replace(/\.p\.htm$/, '');
		str += "p['"+key+"'] = (c={}) => `"+ readFileSync(path, 'utf8') + "`;\n";
	});
	templates.forEach(path => {
		const key = path.replace('template/', '').replace(extname(path), '');
		str += "t['"+key+"'] = (c={}) => `"+ readFileSync(path, 'utf8') + "`;\n";
	});
	str += '})();';
	
	writeFileSync('public/lib/_templates.js', str);
	log('Ran templates.'.green, (perf.now()-t).toFixed().yellow, 'ms'.yellow);
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// livereload
function live() {
	const port = existsSync('.livereload') && readFileSync('.livereload', 'utf8').match(/:(\d+)\/livereload.js\?snipver=1/)[1];
	const lrserver = livereload.createServer({...port && {port}});
	
	lrserver.watch(
		[
			'public/index.html',
			'public/css/**/*.css',
			'public/js/**/*.js',
			'public/lib/_*'
		].map( i => join(__dirname, i) )
	);
	log('livereload started...'.magentaB);
}

function toggleManualLivereload() {
	const port = Math.floor(Math.random()*(65000-36000+1))+36000;
	const str = `<script>document.write('<script src=\"http://' + (location.host || 'localhost').split(':')[0] + ':${port}/livereload.js?snipver=1\"></' + 'script>')</script>`;
	const file = '.livereload';
	if ( existsSync(file) ) {
		unlinkSync(file);
		log('Off'.redB);
	} else {
		writeFileSync(file, str);
		log('On'.greenB);
	}
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// full builds
function debug() {
	const SRC = '.';
	const DEST = './public';
	const ROOT = '.';
	
	writeFileSync(SRC+'/html/link-modulepreload/root.htm', ROOT);
	writeFileSync(SRC+'/html/link-stylesheet/root.htm', ROOT);
	writeFileSync(SRC+'/html/script-lib/root.htm', ROOT);
	writeFileSync(SRC+'/html/script-app/root.htm', ROOT);
	writeFileSync(DEST+'/js/gen/root.js', `export default '${ROOT}';`);
	
	runJs();
	runHtml();
	runTemp();
	runSass();
}

function release() {
	// TODO
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// util
function watch(path, fn, init=true) {
	init && fn();
	const watcher = chokidar.watch(path).on('ready', () => {
		watcher
			.on('add',       () => fn())
			.on('addDir',    () => fn())
			.on('unlink',    () => fn())
			.on('unlinkDir', () => fn())
			.on('change',    () => fn());
		log('Watching...'.magentaB, path.whiteB);
	});
}
function watchFile(path, fn, init=true) {
	init && fn();
	const options = {
		awaitWriteFinish: {
			stabilityThreshold: 100,
			pollInterval: 100
		}
	};
	const watcher = chokidar.watch(path, options).on('ready', () => {
		watcher.on('change', () => fn());
		log('Watching...'.magentaB, path.whiteB);
	});
}
function getFiles(dir, res=[]) {
	const files = readdirSync(dir);
	for (let file of files) {
		file = join(dir, file);
		const stats = statSync(file);
		if ( stats.isDirectory() ) {
			getFiles(file, res);
		} else {
			res.push( file.replace(/\\/g, '/') );
		}
	}
	return res;
}
function colors() {
	[
		['red',      31],
		['green',    32],
		['yellow',   33],
		['magenta',  35],
		['redB',     91],
		['greenB',   92],
		['magentaB', 95],
		['whiteB',   97],
	].forEach(([k, n]) => {
		String.prototype.__defineGetter__(k, function () {
			return `[${n}m${this}[0m`;
		});
	});
}