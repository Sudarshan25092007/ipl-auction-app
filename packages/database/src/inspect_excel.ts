import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

let currentDir = '';
try {
  // @ts-ignore
  currentDir = path.dirname(fileURLToPath(import.meta.url));
} catch {
  currentDir = __dirname;
}

const excelPath = path.resolve(currentDir, '../../../IPL MOCK UPDATED AUCTION.xlsx');
console.log('Loading Excel from:', excelPath);

const workbook = XLSX.readFile(excelPath);
console.log('Sheet Names:', workbook.SheetNames);

workbook.SheetNames.forEach((sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);
  console.log(`Sheet: ${sheetName} | Row count: ${data.length}`);
  if (data.length > 0) {
    console.log('First 2 rows:', JSON.stringify(data.slice(0, 2), null, 2));
  }
});
