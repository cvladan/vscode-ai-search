const fs = require('fs');
const path = require('path');

// Ensure dist/webview directory exists
const webviewDistDir = path.join(__dirname, 'dist', 'webview');
if (!fs.existsSync(webviewDistDir)) {
    fs.mkdirSync(webviewDistDir, { recursive: true });
}

// Copy CSS files
const stylesDir = path.join(__dirname, 'src', 'webview', 'styles');
if (fs.existsSync(stylesDir)) {
    const destStylesDir = path.join(webviewDistDir, 'styles');
    if (!fs.existsSync(destStylesDir)) {
        fs.mkdirSync(destStylesDir, { recursive: true });
    }

    const styleFiles = fs.readdirSync(stylesDir);
    styleFiles.forEach(file => {
        if (file.endsWith('.css')) {
            const srcPath = path.join(stylesDir, file);
            const destPath = path.join(destStylesDir, file);
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied ${file} to webview styles`);
        }
    });
}

// Copy JavaScript files
const scriptsDir = path.join(__dirname, 'src', 'webview', 'scripts');
if (fs.existsSync(scriptsDir)) {
    const destScriptsDir = path.join(webviewDistDir, 'scripts');
    if (!fs.existsSync(destScriptsDir)) {
        fs.mkdirSync(destScriptsDir, { recursive: true });
    }

    const scriptFiles = fs.readdirSync(scriptsDir);
    scriptFiles.forEach(file => {
        if (file.endsWith('.js')) {
            const srcPath = path.join(scriptsDir, file);
            const destPath = path.join(destScriptsDir, file);
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied ${file} to webview scripts`);
        }
    });
}

// Copy HTML templates
const templatesDir = path.join(__dirname, 'src', 'webview', 'templates');
if (fs.existsSync(templatesDir)) {
    const destTemplatesDir = path.join(webviewDistDir, 'templates');
    if (!fs.existsSync(destTemplatesDir)) {
        fs.mkdirSync(destTemplatesDir, { recursive: true });
    }

    const templateFiles = fs.readdirSync(templatesDir);
    templateFiles.forEach(file => {
        if (file.endsWith('.html')) {
            const srcPath = path.join(templatesDir, file);
            const destPath = path.join(destTemplatesDir, file);
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied ${file} to webview templates`);
        }
    });
}

// Ensure dist/wasm directory exists and copy WASM files
const wasmDistDir = path.join(__dirname, 'dist', 'wasm');
if (!fs.existsSync(wasmDistDir)) {
    fs.mkdirSync(wasmDistDir, { recursive: true });
}

// Copy WASM parser files
const wasmDir = path.join(__dirname, 'wasm');
if (fs.existsSync(wasmDir)) {
    const wasmFiles = fs.readdirSync(wasmDir);
    wasmFiles.forEach(file => {
        if (file.endsWith('.wasm')) {
            const srcPath = path.join(wasmDir, file);
            const destPath = path.join(wasmDistDir, file);
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied ${file} to dist/wasm`);
        }
    });
}

// Copy additional grammar WASM files from the tree-sitter-wasms package (e.g. php, ruby)
// that are not committed under ./wasm. This keeps binary grammars out of the repo while
// still shipping them in dist/wasm for the web-tree-sitter AST splitter.
const EXTRA_WASM_GRAMMARS = [
    'tree-sitter-php.wasm',
    'tree-sitter-ruby.wasm'
];

let treeSitterWasmsDir = null;
try {
    // tree-sitter-wasms ships its grammars under <pkg>/out
    treeSitterWasmsDir = path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out');
} catch (error) {
    console.warn('⚠️  tree-sitter-wasms not found; php/ruby AST will fall back to LangChain.');
}

if (treeSitterWasmsDir && fs.existsSync(treeSitterWasmsDir)) {
    EXTRA_WASM_GRAMMARS.forEach(file => {
        const srcPath = path.join(treeSitterWasmsDir, file);
        const destPath = path.join(wasmDistDir, file);
        if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied ${file} from tree-sitter-wasms to dist/wasm`);
        } else if (!fs.existsSync(srcPath)) {
            console.warn(`⚠️  ${file} not present in tree-sitter-wasms; skipping.`);
        }
    });
}

console.log('Webview assets and WASM files copied successfully!');