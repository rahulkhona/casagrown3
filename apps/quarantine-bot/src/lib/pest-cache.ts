import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.join(__dirname, '..', '..', 'pest-cache.json');

export interface ParsedCategory {
  category: string;
  produce_category: string;
}

export function getCachedCategory(pestName: string): ParsedCategory | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    return data[pestName.toLowerCase()] || null;
  } catch (e) {
    return null;
  }
}

export function setCachedCategory(pestName: string, parsed: ParsedCategory) {
  try {
    let data: Record<string, ParsedCategory> = {};
    if (fs.existsSync(CACHE_PATH)) {
      data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
    data[pestName.toLowerCase()] = parsed;
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to write pest cache', e);
  }
}
