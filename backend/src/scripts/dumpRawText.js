// dumpRawText.js
// Dumps the raw pdf-parse text output with line numbers, so we can see
// exactly how "Quarter" and "Rotations Summary" sections are actually
// formatted in this specific PDF export, instead of guessing.
//
// Usage:
//   cd backend
//   node src/scripts/dumpRawText.js "C:\path\to\26TH JULY MERGED USIU TIGERS VS CONGO NETS.pdf"
//
// (Adjust the require path below if pdf-parse usage differs from this —
// match whatever pdfExtraction.js / reportExtractors.js already use.)

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node dumpRawText.js <path-to-pdf>');
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();

  const normalizedText = data.text.replace(/\t/g, ' ');
  const rawLines = normalizedText.split('\n');

  // Write full numbered dump to a file (easier to search/scroll than terminal output)
  const outPath = path.join(__dirname, '../../raw-dump.txt');
  const numbered = rawLines.map((l, i) => `${String(i).padStart(5, ' ')}: ${l}`).join('\n');
  fs.writeFileSync(outPath, numbered, 'utf8');
  console.log(`Full dump written to: ${outPath}`);
  console.log(`Total lines: ${rawLines.length}`);

  // Also print just the lines around any mention of "Quarter" or "Rotation"
  // so we can see those sections immediately without opening the file.
  console.log('\n--- Lines mentioning "Quarter" (context: 3 lines before/after) ---');
  rawLines.forEach((line, i) => {
    if (/quarter/i.test(line)) {
      const start = Math.max(0, i - 3);
      const end = Math.min(rawLines.length, i + 4);
      console.log(`\n[around line ${i}]`);
      for (let j = start; j < end; j += 1) {
        console.log(`${String(j).padStart(5, ' ')}: ${rawLines[j]}`);
      }
    }
  });

  console.log('\n--- Lines mentioning "Rotation" (context: 3 lines before/after) ---');
  rawLines.forEach((line, i) => {
    if (/rotation/i.test(line)) {
      const start = Math.max(0, i - 3);
      const end = Math.min(rawLines.length, i + 4);
      console.log(`\n[around line ${i}]`);
      for (let j = start; j < end; j += 1) {
        console.log(`${String(j).padStart(5, ' ')}: ${rawLines[j]}`);
      }
    }
  });
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});