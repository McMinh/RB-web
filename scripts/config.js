// scripts/config.js

module.exports = {
    // Riftcodex: miễn phí, không cần key
    RIFTCODEX_BASE: 'https://api.riftcodex.com/cards',
    
    // tcgapi.dev: lấy key miễn phí tại https://tcgapi.dev/dashboard
    // 100 requests/ngày, không cần thẻ tín dụng
    TCGAPI_KEY: process.env.TCGAPI_KEY || 'tcg_live_22598cbfdaf2e336a1e00d045c4c42307334c2c6',
    TCGAPI_BASE: 'https://api.tcgapi.dev/v1',
    TCGAPI_GAME: 'riftbound-league-of-legends-trading-card-game',
    
    // Output
    OUTPUT_PATH: 'data/cards.json',
    
    // Rate limiting (ms)
    DELAY_BETWEEN_REQUESTS: 150,
};