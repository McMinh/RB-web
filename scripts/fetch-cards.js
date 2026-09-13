// scripts/fetch-cards.js
// Chạy: node scripts/fetch-cards.js

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_BASE = 'https://api.riftcodex.com/cards';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'cards.json');
const PAGE_SIZE = 50;
const DELAY = 150; // ms giữa các request

// ============================================
// HTTP GET
// ============================================
function httpGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode}`));
                }
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
            });
        }).on('error', reject);
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ============================================
// FETCH TẤT CẢ THẺ TỪ RIFTCODEX
// ============================================
async function fetchAllCards() {
    console.log('📡 Đang tải thẻ từ Riftcodex...');
    
    const allCards = [];
    let page = 1;
    let emptyCount = 0;
    
    while (true) {
        const url = `${API_BASE}?page=${page}&size=${PAGE_SIZE}`;
        process.stdout.write(`   Trang ${page}... `);
        
        let data;
        try {
            data = await httpGet(url);
        } catch (err) {
            console.log(`❌ Lỗi: ${err.message}`);
            break;
        }
        
        const items = data.items || [];
        
        if (items.length === 0) {
            emptyCount++;
            console.log(`0 thẻ`);
            if (emptyCount >= 2) {
                console.log(`   🛑 Dừng (2 trang rỗng liên tiếp)`);
                break;
            }
            page++;
            await sleep(DELAY);
            continue;
        }
        
        emptyCount = 0;
        allCards.push(...items);
        console.log(`${items.length} thẻ (tổng: ${allCards.length})`);
        
        // Trang cuối nếu ít hơn PAGE_SIZE
        if (items.length < PAGE_SIZE) {
            console.log(`   🏁 Trang cuối`);
            break;
        }
        
        page++;
        await sleep(DELAY);
    }
    
    console.log(`\n✅ Đã tải ${allCards.length} thẻ\n`);
    return allCards;
}

// ============================================
// CHUẨN HÓA DỮ LIỆU
// ============================================
function normalizeCard(raw) {
    // === ID thẻ: riftbound_id có dạng "unl-229*-219" ===
    // Chuẩn hóa thành "UNL-229" (uppercase, bỏ phần *-219)
    let id = raw.riftbound_id || raw.id || '';
    id = id.split('*')[0].split('/')[0].toUpperCase();  // "unl-229" → "UNL-229"
    
    // === Domain: có thể là array nhiều domain ===
    let domain = raw.classification?.domain || [];
    if (!Array.isArray(domain)) domain = [domain];
    // Lấy domain chính (hoặc ghép nếu nhiều)
    const domainStr = domain.length > 1 
        ? domain.join('/')       // "Fury/Order"
        : (domain[0] || '');
    
    // === Ảnh: media.image_url ===
    const image = raw.media?.image_url || '';
    
    // === Text ===
    const text = raw.text?.plain || '';
    
    // === Set ===
    const set = raw.set?.label || raw.set?.set_id || '';
    
    // === Rarity: giữ nguyên ===
    const rarity = raw.classification?.rarity || '';
    
    // === Type ===
    const type = raw.classification?.type || '';
    const supertype = raw.classification?.supertype || '';
    
    return {
        id: id,
        name: raw.name || '',
        type: type,
        supertype: supertype,
        domain: domainStr,
        rarity: rarity,
        set: set,
        energy: raw.attributes?.energy ?? null,
        might: raw.attributes?.might ?? null,
        power: raw.attributes?.power ?? null,
        text: text,
        image: image,
        artist: raw.media?.artist || '',
        tcgplayerId: raw.tcgplayer_id ? parseInt(raw.tcgplayer_id) : null,
        collectorNumber: raw.collector_number ?? null,
        tags: raw.tags || [],
        isSignature: raw.metadata?.signature || false,
        isAlternateArt: raw.metadata?.alternate_art || false,
    };
}

// ============================================
// MAIN
// ============================================
(async () => {
    console.log('═══════════════════════════════════════');
    console.log('  RIFTBOUND CARD FETCHER');
    console.log('  Nguồn: Riftcodex API (miễn phí)');
    console.log('═══════════════════════════════════════\n');
    
    try {
        const rawCards = await fetchAllCards();
        
        if (rawCards.length === 0) {
            throw new Error('Không có thẻ nào được tải');
        }
        
        // Chuẩn hóa
        console.log('🔀 Đang chuẩn hóa dữ liệu...');
        const cards = rawCards.map(normalizeCard);
        
        // Ghi file
        fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cards, null, 2));
        
        console.log(`💾 Đã lưu: ${OUTPUT_PATH}`);
        console.log(`📦 Tổng số thẻ: ${cards.length}\n`);
        
        // Thống kê theo set
        const sets = {};
        cards.forEach(c => { sets[c.set] = (sets[c.set] || 0) + 1; });
        console.log('📊 Phân bố theo set:');
        Object.entries(sets)
            .sort((a, b) => b[1] - a[1])
            .forEach(([set, count]) => console.log(`   ${set}: ${count}`));
        
        // Thẻ mẫu
        console.log('\n🔍 Thẻ mẫu:');
        console.log(JSON.stringify(cards[0], null, 2));
        
    } catch (err) {
        console.error('\n❌ Lỗi:', err.message);
        process.exit(1);
    }
})();