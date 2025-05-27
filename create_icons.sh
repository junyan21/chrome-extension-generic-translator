#\!/bin/bash

# Create icons directory if it doesn't exist
mkdir -p icons

# Create a simple SVG icon
cat > icon.svg << 'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="16" fill="url(#grad)"/>
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <text x="64" y="75" font-family="Arial, sans-serif" font-size="48" font-weight="bold" text-anchor="middle" fill="white">訳</text>
</svg>
SVG

echo "SVG icon created. Please convert to PNG manually or use an online converter."
echo "Required sizes: 16x16, 48x48, 128x128"
echo ""
echo "For now, creating simple colored squares as placeholders..."

# Create simple placeholder PNGs using ImageMagick if available, otherwise create empty files
if command -v convert &> /dev/null; then
    convert -size 16x16 xc:'#667eea' icons/icon16.png
    convert -size 48x48 xc:'#667eea' icons/icon48.png
    convert -size 128x128 xc:'#667eea' icons/icon128.png
    echo "Placeholder icons created with ImageMagick"
else
    # Create empty placeholder files
    touch icons/icon16.png
    touch icons/icon48.png
    touch icons/icon128.png
    echo "Empty placeholder icon files created (ImageMagick not found)"
fi
