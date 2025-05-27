const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isWatch = process.argv.includes('--watch');

// Build Tailwind CSS
const buildTailwind = () => {
  console.log('Building Tailwind CSS...');
  execSync('npx tailwindcss -i ./src/tailwind.css -o ./dist/tailwind.css --minify', { stdio: 'inherit' });
};

// Copy static files
const copyStaticFiles = () => {
  const staticFiles = [
    'manifest.json',
    'popup.html',
    'options.html',
    'src/styles.css'
  ];

  staticFiles.forEach(file => {
    const src = path.join(__dirname, file);
    const dest = path.join(__dirname, 'dist', path.basename(file));
    
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Copied ${file} to dist/`);
    }
  });

  // Copy icons
  const iconsDir = path.join(__dirname, 'icons');
  const distIconsDir = path.join(__dirname, 'dist', 'icons');
  
  if (!fs.existsSync(distIconsDir)) {
    fs.mkdirSync(distIconsDir, { recursive: true });
  }

  if (fs.existsSync(iconsDir)) {
    fs.readdirSync(iconsDir).forEach(file => {
      fs.copyFileSync(
        path.join(iconsDir, file),
        path.join(distIconsDir, file)
      );
    });
    console.log('Copied icons to dist/icons/');
  }
};

// Build configuration
const buildOptions = {
  entryPoints: [
    'src/background.ts',
    'src/content.ts',
    'src/popup.ts',
    'src/options.ts'
  ],
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome90',
  sourcemap: true,
  define: {
    'process.env.NODE_ENV': '"production"'
  }
};

// Initial build
copyStaticFiles();
buildTailwind();

if (isWatch) {
  // Watch mode
  esbuild.context(buildOptions).then(ctx => {
    ctx.watch();
    console.log('Watching for changes...');
    
    // Watch static files
    const watchFiles = ['manifest.json', 'popup.html', 'options.html', 'src/styles.css'];
    watchFiles.forEach(file => {
      fs.watchFile(file, () => {
        console.log(`${file} changed, copying...`);
        copyStaticFiles();
      });
    });
  });
} else {
  // Single build
  esbuild.build(buildOptions).then(() => {
    console.log('Build completed!');
  }).catch(() => process.exit(1));
}