const XLSX = require('xlsx');
const path = require('path');

const excelPath = path.resolve(
  __dirname,
  '../../../IPL MOCK UPDATED AUCTION.xlsx'
);
console.log('Loading Excel from:', excelPath);

function parsePrice(val) {
  if (!val) return 0;
  const str = val.toString().toLowerCase().replace(/\s+/g, '');
  if (str.endsWith('cr')) {
    return parseFloat(str) * 100; // 2cr -> 200 Lakhs
  }
  if (str.endsWith('l') || str.endsWith('lakh')) {
    return parseFloat(str);
  }
  const num = parseFloat(str);
  if (!isNaN(num)) {
    // If it's a number, assume it's in Lakhs (e.g. 50 -> 50 Lakhs)
    return num < 10 ? num * 100 : num; // e.g. 2 -> 200 Lakhs, 50 -> 50 Lakhs
  }
  return 20; // Default min base price
}

try {
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets['Sheet1'];
  // Set defval: null so empty cells are present
  const data = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`Total rows in JSON: ${data.length}`);

  const colPairs = [
    { nameKey: '__EMPTY', priceKey: '__EMPTY_1', colName: 'A-B' },
    { nameKey: '__EMPTY_3', priceKey: '__EMPTY_4', colName: 'D-E' },
    { nameKey: '__EMPTY_6', priceKey: '__EMPTY_7', colName: 'G-H' },
    { nameKey: '__EMPTY_9', priceKey: '__EMPTY_10', colName: 'J-K' },
    { nameKey: '__EMPTY_12', priceKey: '__EMPTY_13', colName: 'M-N' },
    { nameKey: '__EMPTY_15', priceKey: '__EMPTY_16', colName: 'P-Q' },
    { nameKey: '__EMPTY_18', priceKey: '__EMPTY_19', colName: 'S-T' },
  ];

  const players = [];

  colPairs.forEach((pair) => {
    let currentCategory = '';
    let categoryPlayerCount = 0;

    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      const nameVal = row[pair.nameKey];
      const priceVal = row[pair.priceKey];

      if (!nameVal) continue;

      const nameStr = nameVal.toString().trim();
      const priceStr = priceVal ? priceVal.toString().trim() : '';

      // Check if this row is a header
      const isHeader =
        priceStr.toLowerCase().includes('base price') ||
        nameStr.toLowerCase().includes('batters') ||
        nameStr.toLowerCase().includes('pacers') ||
        nameStr.toLowerCase().includes('spinners') ||
        nameStr.toLowerCase().includes('allrounders') ||
        nameStr.toLowerCase().includes('all rounders') ||
        nameStr.toLowerCase().includes('wicket') ||
        nameStr.toLowerCase().includes('retired');

      if (isHeader) {
        if (currentCategory) {
          console.log(
            `Finished category: "${currentCategory}" | Players: ${categoryPlayerCount}`
          );
        }
        currentCategory = nameStr;
        categoryPlayerCount = 0;
        continue;
      }

      if (!currentCategory) {
        // Skip players that appear before any category header
        continue;
      }

      categoryPlayerCount++;
      const basePriceLakhs = parsePrice(priceStr);

      // Determine attributes from currentCategory
      const catLower = currentCategory.toLowerCase();
      const isMarquee =
        catLower.includes('premium') || catLower.includes('marquee');
      const nationality =
        catLower.includes('overseas') || catLower.includes('retired')
          ? 'overseas'
          : 'indian';
      const isCapped = !catLower.includes('uncapped');

      let role = 'batter';
      if (catLower.includes('batters') || catLower.includes('batting')) {
        role = 'batter';
      } else if (
        catLower.includes('pacers') ||
        catLower.includes('bowlers') ||
        catLower.includes('bowler') ||
        catLower.includes('pacer')
      ) {
        role = 'pacer';
      } else if (
        catLower.includes('spinners') ||
        catLower.includes('spinner')
      ) {
        role = 'spinner';
      } else if (
        catLower.includes('allrounders') ||
        catLower.includes('all rounders') ||
        catLower.includes('allrounder')
      ) {
        role = 'allrounder';
      } else if (catLower.includes('wicket') || catLower.includes('wk')) {
        role = 'wk';
      }

      players.push({
        name: nameStr,
        category: currentCategory,
        role,
        nationality,
        isMarquee,
        isCapped,
        basePriceLakhs,
      });
    }

    if (currentCategory) {
      console.log(
        `Finished category: "${currentCategory}" | Players: ${categoryPlayerCount}`
      );
    }
  });

  console.log(`\nParsed ${players.length} players total.`);
  console.log(
    'Sample parsed players (first 5):',
    JSON.stringify(players.slice(0, 5), null, 2)
  );
} catch (error) {
  console.error('Error executing trial parse:', error);
}
