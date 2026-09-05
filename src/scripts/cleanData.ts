import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const inputDir = path.join(process.cwd(), 'backup_old_code/csv');
const outputDir = path.join(process.cwd(), 'src/scripts/cleaned');

// Helper to parse Dates
function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '' || dateStr === '-') return null;
  // Handle DD/MM/YYYY
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day).toISOString();
    }
  }
  // Try direct parsing
  const fallback = new Date(dateStr);
  if (!isNaN(fallback.getTime())) {
    return fallback.toISOString();
  }
  return null;
}

// Helper to parse Float Amount
function parseAmount(amountStr: string): number | null {
  if (!amountStr) return null;
  const val = parseFloat(amountStr.replace(/,/g, ''));
  return isNaN(val) ? null : val;
}

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Clean Contacts
function cleanContacts() {
  console.log('Cleaning Contacts.csv...');
  const csvContent = fs.readFileSync(path.join(inputDir, 'Contacts.csv'), 'utf8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  
  const cleaned = records.map(row => {
    // Normalize emails
    let email = row['Email']?.trim() || null;
    if (email && email.includes(',')) {
      email = email.split(',')[0].trim();
    }
    
    return {
      projectName: row['Project']?.trim(),
      companyAddress: row['Company-Address']?.trim(),
      country: row['Country']?.trim(),
      customerName: row['Customer-Name']?.trim(),
      email,
      phone: row['Phone-Number']?.trim(),
    };
  }).filter(c => c.projectName && c.projectName !== '-');

  fs.writeFileSync(path.join(outputDir, 'Contacts.json'), JSON.stringify(cleaned, null, 2));
}

// 2. Clean Products
function cleanProducts() {
  console.log('Cleaning Products.csv...');
  // Note: the original file has a leading space
  const filename = fs.existsSync(path.join(inputDir, ' Products.csv')) 
                   ? ' Products.csv' 
                   : 'Products.csv';
  
  const csvContent = fs.readFileSync(path.join(inputDir, filename), 'utf8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  
  const cleaned = records.map(row => ({
    name: row['Product']?.trim(),
    formula: row['Formula']?.trim(),
    price: parseAmount(row['Cost']),
    category: row['Category']?.trim(),
    brand: row['Brand']?.trim(),
    available: row['Available']?.trim(),
  })).filter(p => p.name && p.name !== '-' && p.available !== 'No');

  fs.writeFileSync(path.join(outputDir, 'Products.json'), JSON.stringify(cleaned, null, 2));
}

// 3. Clean Opportunities
function cleanOpportunities() {
  console.log('Cleaning Opportunities.csv...');
  const csvContent = fs.readFileSync(path.join(inputDir, 'Opportunities.csv'), 'utf8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  
  const cleaned = records.map(row => {
    // Parse Follow-Up-History
    const historyText = row['Follow-Up-History'];
    const logs = [];
    if (historyText) {
      const logPattern = /(?:^|\n)\[([^\]]+)\]\s*([\s\S]*?)(?=\n\[|$)/g;
      let match;
      while ((match = logPattern.exec(historyText)) !== null) {
        const dateStr = match[1];
        const rawContent = match[2].trim();
        
        // Extract tag like [YUI] or ['YUI' added due date to 20/08/2026]
        const tagMatch = rawContent.match(/^\[([^\]]+)\]\s*/);
        
        if (tagMatch) {
          const innerTag = tagMatch[1];
          const remainingText = rawContent.substring(tagMatch[0].length).trim();
          
          if (innerTag.includes('added due date') || innerTag.includes('Change/Add')) {
            // It's a system log
            logs.push({
              date: parseDate(dateStr),
              content: `[${innerTag}]`,
              isSystem: true,
              author: innerTag.split("'")[1] || innerTag.split(" ")[0] // try to guess author
            });
            
            // If there's remaining text, it's a comment
            if (remainingText) {
              logs.push({
                date: parseDate(dateStr),
                content: remainingText,
                isSystem: false,
                author: innerTag.split("'")[1] || innerTag.split(" ")[0]
              });
            }
          } else {
            // It's just an author tag (e.g. [YUI])
            logs.push({
              date: parseDate(dateStr),
              content: remainingText,
              isSystem: false,
              author: innerTag
            });
          }
        } else {
          // No tag found
          logs.push({
            date: parseDate(dateStr),
            content: rawContent,
            isSystem: false,
            author: null
          });
        }
      }
    }

    return {
      topic: row['Topic']?.trim(),
      value: parseAmount(row['Amount']),
      projectName: row['Project']?.trim(),
      cardOwner: row['Card-Owner']?.trim(),
      status: row['Status']?.trim(),
      type: row['Type']?.trim(),
      
      // Dates
      dueDate: parseDate(row['Due-Date']),
      goodsReadyDate: parseDate(row['Goods-Ready-Date']),
      goodsLoadingDate: parseDate(row['Goods-Loading-Date']),
      closedAt: parseDate(row['End-Date']),
      quotedAt: parseDate(row['Quoted-Date']),
      
      // Other retained fields
      reserveId: row['Reserve']?.trim() || null,
      invoiceId: row['Invoice']?.trim() || null,
      attachmentUrl: row['Link']?.trim() || null,
      
      activityLogs: logs,
    };
  }).filter(o => o.projectName && o.projectName !== '-');

  fs.writeFileSync(path.join(outputDir, 'Opportunities.json'), JSON.stringify(cleaned, null, 2));
}

async function main() {
  cleanContacts();
  cleanProducts();
  cleanOpportunities();
  console.log('Done cleaning data.');
}

main().catch(console.error);
