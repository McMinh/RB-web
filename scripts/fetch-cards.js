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
    // === ID thẻ: giữ dấu * cho thẻ signature ===
    let id = raw.riftbound_id || raw.id || '';
    
    // Bước 1: Tách phần signature (trước dấu *)
    // "unl-229*-219" → ["unl-229", "-219"]
    // "unl-121-219"  → ["unl-121-219"]
    const starParts = id.split('*');
    const isSignature = starParts.length > 1;  // có dấu * → signature
    let baseId = starParts[0];                 // "unl-229"
    let suffix = starParts[1] || '';           // "-219"
    
    // Bước 2: Bỏ hậu tố -NNN ở cuối baseId nếu có
    // "unl-121-219" → "unl-121"
    // "unl-229"     → "unl-229" (không đổi)
    const parts = baseId.split('-');
    if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1])) {
        baseId = parts.slice(0, -1).join('-');
    }
    
    // Bước 3: Uppercase
    baseId = baseId.toUpperCase();
    
    // Bước 4: Nếu là signature → thêm dấu * vào cuối
    id = isSignature ? `${baseId}*` : baseId;
    
    // === Domain ===
    let domain = raw.classification?.domain || [];
    if (!Array.isArray(domain)) domain = [domain];
    const domainStr = domain.length > 1 
        ? domain.join('/')
        : (domain[0] || '');
    
    return {
        id: id,
        name: raw.name || '',
        type: raw.classification?.type || '',
        supertype: raw.classification?.supertype || '',
        domain: domainStr,
        rarity: raw.classification?.rarity || '',
        set: raw.set?.label || '',
        energy: raw.attributes?.energy ?? null,
        might: raw.attributes?.might ?? null,
        power: raw.attributes?.power ?? null,
        text: raw.text?.plain || '',
        image: raw.media?.image_url || '',
        artist: raw.media?.artist || '',
        tcgplayerId: raw.tcgplayer_id ? parseInt(raw.tcgplayer_id) : null,
        collectorNumber: raw.collector_number ?? null,
        tags: raw.tags || [],
        isSignature: isSignature,
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