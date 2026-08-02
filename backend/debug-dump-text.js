const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node debug-dump-text.js "path/to/file.pdf"');
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();

  const lines = data.text
    .replace(/\t/g, ' ')
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  const outLines = lines.map((l, i) => `${i}\t${l}`);
  fs.writeFileSync('debug-output.txt', outLines.join('\n'), 'utf8');

  console.log(`Wrote ${lines.length} lines to debug-output.txt`);

  console.log('\n--- Lines near "Quarter" ---');
  lines.forEach((line, i) => {
    if (line === 'Quarter' || line.startsWith('Quarter ')) {
      for (let j = Math.max(0, i - 1); j < Math.min(lines.length, i + 15); j += 1) {
        console.log(`${j}\t${lines[j]}`);
      }
      console.log('...');
    }
  });

  console.log('\n--- Lines near "Rotations" ---');
  lines.forEach((line, i) => {
    if (line.startsWith('Rotations')) {
      for (let j = Math.max(0, i - 1); j < Math.min(lines.length, i + 15); j += 1) {
        console.log(`${j}\t${lines[j]}`);
      }
      console.log('...');
    }
  });
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
