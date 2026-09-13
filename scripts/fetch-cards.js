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
    const publicCode = (raw.public_code || raw.id || '').split('/')[0];
    
    // Domain có thể là array hoặc string
    let domain = raw.classification?.domain || raw.domain || '';
    if (Array.isArray(domain)) domain = domain[0] || '';
    
    // Ảnh: Riftcodex có thể trả nhiều format
    let image = '';
    if (raw.images && Array.isArray(raw.images) && raw.images.length > 0) {
        const img = raw.images[0];
        image = img.medium || img.large || img.small || img.url || '';
    } else if (raw.image) {
        image = raw.image;
    } else {
        // Fallback URL đoán — test trong trình duyệt trước
        image = `https://images.riftcodex.com/cards/${publicCode}.webp`;
    }
    
    // Text
    let text = '';
    if (raw.text?.plain) text = raw.text.plain;
    else if (Array.isArray(raw.rules) && raw.rules.length > 0) text = raw.rules[0];
    else if (raw.text) text = String(raw.text);
    
    return {
        id: publicCode,
        name: raw.name || '',
        type: raw.classification?.type || raw.type || '',
        domain: domain,
        rarity: raw.classification?.rarity || raw.rarity || '',
        set: raw.set?.label || raw.set || '',
        energy: raw.attributes?.energy ?? raw.energy ?? null,
        might: raw.attributes?.might ?? raw.might ?? null,
        power: raw.attributes?.power ?? raw.power ?? null,
        text: text,
        image: image,
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