// scripts/merge-cards.js
// Chạy: node scripts/merge-cards.js

const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('./config');

// ============================================
// HTTP HELPER
// ============================================
function httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`JSON parse error: ${e.message}`));
                }
            });
        }).on('error', reject);
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ============================================
// BƯỚC 1: FETCH RIFTCODEX (metadata + ảnh)
// ============================================
async function fetchRiftcodex() {
    console.log('\n📡 [1/2] Đang tải metadata từ Riftcodex...');
    
    const allCards = [];
    let page = 1;
    let totalPages = 1;
    
    do {
        const url = `${config.RIFTCODEX_BASE}?page=${page}&size=50`;
        console.log(`   Trang ${page}/${totalPages}...`);
        
        const data = await httpGet(url);
        
        if (data.items && Array.isArray(data.items)) {
            allCards.push(...data.items);
        }
        
        totalPages = data.pages || 1;
        page++;
        
        await sleep(config.DELAY_BETWEEN_REQUESTS);
    } while (page <= totalPages);
    
    console.log(`   ✅ Đã tải ${allCards.length} thẻ từ Riftcodex`);
    return allCards;
}

// ============================================
// BƯỚC 2: FETCH TCGAPI (giá market)
// ============================================
async function fetchTcgApiPrices() {
    console.log('\n💰 [2/2] Đang tải giá từ tcgapi.dev...');
    
    if (!config.TCGAPI_KEY) {
        console.warn('   ⚠️  Không có TCGAPI_KEY — bỏ qua bước lấy giá.');
        console.warn('   ⚠️  Đăng ký free key tại https://tcgapi.dev/dashboard');
        return {};
    }
    
    const priceMap = {};
    let page = 1;
    let hasMore = true;
    const perPage = 200;  // max của API
    
    while (hasMore) {
        const url = `${config.TCGAPI_BASE}/games/${config.TCGAPI_GAME}/cards?per_page=${perPage}&page=${page}`;
        console.log(`   Trang ${page}...`);
        
        try {
            const data = await httpGet(url, {
                'X-API-Key': config.TCGAPI_KEY,
            });
            
            // tcgapi.dev trả về { data: [...] } hoặc { items: [...] }
            const cards = data.data || data.items || data.cards || [];
            
            if (cards.length === 0) {
                hasMore = false;
                break;
            }
            
            for (const card of cards) {
                // Tìm field dùng làm key — thử nhiều khả năng
                const key = card.public_code 
                         || card.card_number 
                         || card.number 
                         || card.id;
                
                if (key) {
                    priceMap[key] = {
                        market_price: card.market_price 
                                   || card.prices?.market 
                                   || card.price?.market 
                                   || null,
                        foil_market_price: card.foil_market_price 
                                        || card.prices?.foil_market 
                                        || null,
                        price_change_7d: card.price_change_7d 
                                      || card.trends?.days_7?.percent_change 
                                      || null,
                    };
                }
            }
            
            // Kiểm tra còn trang tiếp không
            const meta = data.meta || {};
            if (meta.has_more === false || cards.length < perPage) {
                hasMore = false;
            } else {
                page++;
            }
            
            await sleep(config.DELAY_BETWEEN_REQUESTS);
        } catch (err) {
            console.error(`   ❌ Lỗi trang ${page}: ${err.message}`);
            hasMore = false;
        }
    }
    
    console.log(`   ✅ Đã tải giá cho ${Object.keys(priceMap).length} thẻ`);
    return priceMap;
}

// ============================================
// BƯỚC 3: MERGE THEO public_code
// ============================================
function mergeData(riftcodexCards, priceMap) {
    console.log('\n🔀 [3/3] Đang merge dữ liệu...');
    
    let matched = 0;
    let missingPrice = 0;
    
    const merged = riftcodexCards.map(riftCard => {
        // Riftcodex dùng public_code (vd: "OGN-296/298" hoặc "OGN-296")
        const rawCode = riftCard.public_code || riftCard.id;
        
        // Chuẩn hóa: bỏ phần /298 nếu có
        const publicCode = rawCode.split('/')[0];
        
        // Tìm giá trong priceMap — thử cả rawCode và publicCode
        const price = priceMap[rawCode] || priceMap[publicCode] || null;
        
        if (price && price.market_price) {
            matched++;
        } else {
            missingPrice++;
        }
        
        // Xác định URL ảnh
        // Riftcodex có thể trả về trường image hoặc images
        let image = '';
        if (riftCard.images?.length > 0) {
            image = riftCard.images[0].medium 
                 || riftCard.images[0].large 
                 || riftCard.images[0].small 
                 || '';
        } else if (riftCard.image) {
            image = riftCard.image;
        } else {
            // Fallback: tự build URL từ Riftcodex CDN
            image = `https://images.riftcodex.com/cards/${publicCode}.webp`;
        }
        
        return {
            id: publicCode,
            name: riftCard.name,
            type: riftCard.classification?.type || riftCard.type || '',
            domain: (riftCard.classification?.domain || riftCard.domain || [])[0] 
                 || riftCard.domain || '',
            rarity: riftCard.classification?.rarity || riftCard.rarity || '',
            set: riftCard.set?.label || riftCard.set || '',
            energy: riftCard.attributes?.energy ?? riftCard.energy ?? null,
            might: riftCard.attributes?.might ?? riftCard.might ?? null,
            power: riftCard.attributes?.power ?? riftCard.power ?? null,
            text: riftCard.text?.plain || riftCard.rules?.[0] || '',
            image: image,
            // Giá từ tcgapi.dev
            marketPrice: price?.market_price ?? null,
            foilPrice: price?.foil_market_price ?? null,
            priceChange7d: price?.price_change_7d ?? null,
        };
    });
    
    console.log(`   ✅ Đã merge: ${merged.length} thẻ`);
    console.log(`   📊 Có giá: ${matched} | Thiếu giá: ${missingPrice}`);
    
    return merged;
}

// ============================================
// MAIN
// ============================================
(async () => {
    console.log('═══════════════════════════════════════════');
    console.log('  RIFTBOUND DATA MERGER');
    console.log('  Riftcodex (metadata) + tcgapi.dev (giá)');
    console.log('═══════════════════════════════════════════');
    
    try {
        // 1. Fetch Riftcodex
        const riftcodexCards = await fetchRiftcodex();
        
        if (riftcodexCards.length === 0) {
            throw new Error('Riftcodex không trả về dữ liệu');
        }
        
        // 2. Fetch tcgapi.dev prices
        const priceMap = await fetchTcgApiPrices();
        
        // 3. Merge
        const merged = mergeData(riftcodexCards, priceMap);
        
        // 4. Ghi file
        const outputPath = path.join(__dirname, '..', config.OUTPUT_PATH);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2));
        
        console.log(`\n🎉 Hoàn tất! Đã lưu vào: ${outputPath}`);
        console.log(`   Tổng số thẻ: ${merged.length}`);
        
        // Thống kê nhanh
        const sets = {};
        merged.forEach(c => { sets[c.set] = (sets[c.set] || 0) + 1; });
        console.log('\n📦 Phân bố theo set:');
        Object.entries(sets).forEach(([set, count]) => {
            console.log(`   ${set}: ${count} thẻ`);
        });
        
    } catch (err) {
        console.error('\n❌ Lỗi:', err.message);
        process.exit(1);
    }
})();