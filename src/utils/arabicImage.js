const sharp = require('sharp');

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function renderArabicWordImage(arabic) {
  const safeArabic = escapeXml(arabic);
  const fontSize = 96;
  const width = Math.max(360, Math.min(1200, Math.round(String(arabic).length * 58 + 140)));
  const height = 170;

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="28" fill="#1f2d3d"/>
      <text
        x="50%"
        y="52%"
        text-anchor="middle"
        dominant-baseline="middle"
        direction="rtl"
        unicode-bidi="bidi-override"
        fill="#ffffff"
        font-size="${fontSize}"
        font-weight="700"
        font-family="Noto Naskh Arabic, Amiri, Scheherazade New, Arial, sans-serif"
      >${safeArabic}</text>
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}

module.exports = {
  renderArabicWordImage
};
