// ============================================
// RIFTBOUND COLLECTION MANAGER
// ============================================

const STORAGE_KEY = 'riftbound_collection';
let cardDatabase = [];  // Toàn bộ database thẻ
let cardMap = {};       // id -> card object

// ============================================
// KHỞI TẠO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadCardDatabase();
    setupTabs();
    setupEventListeners();
    renderCollection();
    renderStats();
    renderSearchResults();
});

// ============================================
// LOAD DATABASE THẺ
// ============================================
async function loadCardDatabase() {
    try {
        const res = await fetch('data/cards.json');
        if (!res.ok) throw new Error('Không tải được data/cards.json');
        cardDatabase = await res.json();
        cardDatabase.forEach(c => cardMap[c.id] = c);
        console.log(`Đã tải ${cardDatabase.length} thẻ.`);
    } catch (err) {
        console.warn('Không tải được database thẻ:', err);
        console.warn('Bạn cần đặt file data/cards.json.');
        cardDatabase = [];
        cardMap = {};
    }
}

// ============================================
// LOCALSTORAGE
// ============================================
function loadCollection() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
}

function saveCollection(collection) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
}

// ============================================
// TABS
// ============================================
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        });
    });
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Collection
    document.getElementById('filter-collection').addEventListener('input', renderCollection);
    document.getElementById('sort-collection').addEventListener('change', renderCollection);
    document.getElementById('export-json').addEventListener('click', exportJSON);
    document.getElementById('export-csv').addEventListener('click', exportCSV);
    document.getElementById('clear-collection').addEventListener('click', clearCollection);

    // Search
    document.getElementById('search-input').addEventListener('input', renderSearchResults);
    document.getElementById('filter-domain').addEventListener('change', renderSearchResults);
    document.getElementById('filter-rarity').addEventListener('change', renderSearchResults);

    // Import
    document.getElementById('import-btn').addEventListener('click', handleImport);
    document.getElementById('manual-add').addEventListener('click', handleManualAdd);
    document.getElementById('download-template').addEventListener('click', downloadTemplate);
}

// ============================================
// RENDER COLLECTION
// ============================================
function renderCollection() {
    const collection = loadCollection();
    const filter = document.getElementById('filter-collection').value.toLowerCase();
    const sortBy = document.getElementById('sort-collection').value;
    const container = document.getElementById('collection-list');
    const statsBar = document.getElementById('collection-stats');

    let entries = Object.entries(collection).map(([id, qty]) => ({
        id,
        qty,
        card: cardMap[id] || null
    }));

    // Filter
    if (filter) {
        entries = entries.filter(e =>
            e.id.toLowerCase().includes(filter) ||
            (e.card && e.card.name.toLowerCase().includes(filter))
        );
    }

    // Sort
    entries.sort((a, b) => {
        if (sortBy === 'quantity') return b.qty - a.qty;
        if (sortBy === 'domain') {
            const da = a.card?.domain || '';
            const db = b.card?.domain || '';
            return da.localeCompare(db);
        }
        if (sortBy === 'rarity') {
            const ra = a.card?.rarity || '';
            const rb = b.card?.rarity || '';
            return ra.localeCompare(rb);
        }
        const na = a.card?.name || a.id;
        const nb = b.card?.name || b.id;
        return na.localeCompare(nb);
    });

    // Stats
    const totalQty = entries.reduce((s, e) => s + e.qty, 0);
    const uniqueCount = entries.length;
    statsBar.innerHTML = `
        <div class="stat-item">
            <span class="stat-label">Loại thẻ</span>
            <span class="stat-value">${uniqueCount}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Tổng số thẻ</span>
            <span class="stat-value">${totalQty}</span>
        </div>
    `;

    // Render
    if (entries.length === 0) {
        container.innerHTML = `<div class="empty">Bộ sưu tập trống. Vào tab <strong>Import</strong> để thêm thẻ.</div>`;
        return;
    }

    container.innerHTML = entries.map(e => cardHTML(e.card, e.qty, e.id, true)).join('');

    // Gắn sự kiện
    container.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const action = btn.dataset.action;
            if (action === 'inc') changeQty(id, 1);
            if (action === 'dec') changeQty(id, -1);
            if (action === 'del') changeQty(id, -9999);
        });
    });
}

// ============================================
// HTML CHO 1 CARD
// ============================================
function cardHTML(card, qty, id, showActions = false) {
    const name = card?.name || id;
    const domain = card?.domain || '';
    const rarity = card?.rarity || '';
    const type = card?.type || '';

    const tags = [];
    if (domain) tags.push(`<span class="tag domain-${domain}">${domain}</span>`);
    if (rarity) tags.push(`<span class="tag rarity-${rarity}">${rarity}</span>`);
    if (type) tags.push(`<span class="tag">${type}</span>`);

    return `
        <div class="card-item">
            <div class="card-header">
                <div class="card-name">${escapeHTML(name)}</div>
                ${qty > 0 ? `<div class="card-qty">${qty}</div>` : ''}
            </div>
            <div class="card-id">${escapeHTML(id)}</div>
            <div class="card-meta">${tags.join('')}</div>
            ${showActions ? `
                <div class="card-actions">
                    <button data-action="dec" data-id="${escapeHTML(id)}">−</button>
                    <button data-action="inc" data-id="${escapeHTML(id)}">+</button>
                    <button data-action="del" data-id="${escapeHTML(id)}">🗑️</button>
                </div>
            ` : ''}
        </div>
    `;
}

// ============================================
// THAY ĐỔI SỐ LƯỢNG
// ============================================
function changeQty(id, delta) {
    const collection = loadCollection();
    if (!collection[id]) return;

    let newQty = collection[id] + delta;
    if (delta === -9999 || newQty <= 0) {
        delete collection[id];
    } else {
        collection[id] = newQty;
    }

    saveCollection(collection);
    renderCollection();
    renderStats();
}

// ============================================
// XÓA HẾT
// ============================================
function clearCollection() {
    if (!confirm('Bạn có chắc muốn xóa toàn bộ bộ sưu tập?')) return;
    localStorage.removeItem(STORAGE_KEY);
    renderCollection();
    renderStats();
}

// ============================================
// EXPORT
// ============================================
function exportJSON() {
    const collection = loadCollection();
    const data = Object.entries(collection).map(([id, qty]) => ({
        id, qty, card: cardMap[id] || null
    }));
    downloadFile(JSON.stringify(data, null, 2), 'collection.json', 'application/json');
}

function exportCSV() {
    const collection = loadCollection();
    const lines = ['card_id,quantity,name,domain,rarity'];
    for (const [id, qty] of Object.entries(collection)) {
        const c = cardMap[id];
        const name = c?.name || '';
        const domain = c?.domain || '';
        const rarity = c?.rarity || '';
        lines.push(`${id},${qty},"${name}",${domain},${rarity}`);
    }
    downloadFile(lines.join('\n'), 'collection.csv', 'text/csv;charset=utf-8');
}

function downloadFile(content, filename, type) {
    const blob = new Blob(['\uFEFF' + content], { type });  // BOM cho UTF-8
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// SEARCH
// ============================================
function renderSearchResults() {
    const q = document.getElementById('search-input').value.toLowerCase();
    const domain = document.getElementById('filter-domain').value;
    const rarity = document.getElementById('filter-rarity').value;
    const container = document.getElementById('search-results');

    let results = cardDatabase.filter(c => {
        if (q && !c.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) return false;
        if (domain && c.domain !== domain) return false;
        if (rarity && c.rarity !== rarity) return false;
        return true;
    });

    if (results.length === 0) {
        container.innerHTML = `<div class="empty">Không tìm thấy thẻ nào.</div>`;
        return;
    }

    // Giới hạn 200 kết quả để tránh lag
    const display = results.slice(0, 200);
    container.innerHTML = display.map(c => cardHTML(c, 0, c.id, false)).join('')
        + (results.length > 200 ? `<div class="empty">... và ${results.length - 200} thẻ khác</div>` : '');
}

// ============================================
// IMPORT CSV
// ============================================
function handleImport() {
    const file = document.getElementById('csv-file').files[0];
    if (!file) {
        alert('Vui lòng chọn file CSV.');
        return;
    }

    const replace = document.getElementById('import-replace').checked;
    const reader = new FileReader();
    const log = document.getElementById('import-log');

    reader.onload = (e) => {
        let text = e.target.result;
        // Bỏ BOM
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

        const lines = text.split(/\r?\n/).filter(l => l.trim());
        let collection = replace ? {} : loadCollection();

        let imported = 0, totalQty = 0, errors = 0;
        let logLines = [];

        lines.forEach((line, idx) => {
            line = line.trim();
            if (!line || line.startsWith('#')) return;

            // Bỏ header
            if (idx === 0) {
                const first = line.split(',')[0].trim().toLowerCase();
                if (['card_id', 'id', 'cardid', 'mã thẻ'].includes(first)) {
                    logLines.push('⏭️  Bỏ qua header');
                    return;
                }
            }

            const fields = parseCSVLine(line);
            if (fields.length < 2) {
                errors++;
                logLines.push(`❌ Dòng ${idx + 1}: thiếu cột`);
                return;
            }

            const id = fields[0].trim();
            const qty = parseInt(fields[1].trim()) || 1;

            if (!id) {
                errors++;
                logLines.push(`❌ Dòng ${idx + 1}: card_id trống`);
                return;
            }

            collection[id] = (collection[id] || 0) + qty;
            imported++;
            totalQty += qty;
            logLines.push(`✅ ${id} × ${qty}`);
        });

        saveCollection(collection);
        renderCollection();
        renderStats();

        logLines.push('');
        logLines.push(`=== KẾT QUẢ ===`);
        logLines.push(`Thành công: ${imported} dòng`);
        logLines.push(`Tổng số thẻ: ${totalQty}`);
        logLines.push(`Lỗi: ${errors}`);

        log.textContent = logLines.join('\n');
    };

    reader.readAsText(file, 'UTF-8');
}

function parseCSVLine(line) {
    const result = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') {
                field += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            result.push(field);
            field = '';
        } else {
            field += c;
        }
    }
    result.push(field);
    return result;
}

// ============================================
// MANUAL ADD
// ============================================
function handleManualAdd() {
    const id = document.getElementById('manual-id').value.trim();
    const qty = parseInt(document.getElementById('manual-qty').value) || 1;
    if (!id) return alert('Nhập Card ID');

    const collection = loadCollection();
    collection[id] = (collection[id] || 0) + qty;
    saveCollection(collection);
    renderCollection();
    renderStats();

    document.getElementById('manual-id').value = '';
    document.getElementById('manual-qty').value = 1;
}

// ============================================
// DOWNLOAD TEMPLATE
// ============================================
function downloadTemplate() {
    const csv = `card_id,quantity,note
UNL-060/219,1,Ví dụ
OGN-001/298,2,Ví dụ
`;
    downloadFile(csv, 'template.csv', 'text/csv;charset=utf-8');
}

// ============================================
// STATS
// ============================================
function renderStats() {
    const collection = loadCollection();
    const container = document.getElementById('stats-content');

    const entries = Object.entries(collection);
    if (entries.length === 0) {
        container.innerHTML = `<div class="empty">Chưa có dữ liệu.</div>`;
        return;
    }

    const byDomain = {};
    const byRarity = {};
    const byType = {};
    let total = 0;
    let unknown = 0;

    for (const [id, qty] of entries) {
        total += qty;
        const c = cardMap[id];
        if (!c) { unknown += qty; continue; }
        byDomain[c.domain || 'Unknown'] = (byDomain[c.domain || 'Unknown'] || 0) + qty;
        byRarity[c.rarity || 'Unknown'] = (byRarity[c.rarity || 'Unknown'] || 0) + qty;
        byType[c.type || 'Unknown'] = (byType[c.type || 'Unknown'] || 0) + qty;
    }

    container.innerHTML = `
        <div class="import-section">
            <h2>Tổng quan</h2>
            <div class="stats-bar">
                <div class="stat-item"><span class="stat-label">Tổng thẻ</span><span class="stat-value">${total}</span></div>
                <div class="stat-item"><span class="stat-label">Loại thẻ</span><span class="stat-value">${entries.length}</span></div>
                <div class="stat-item"><span class="stat-label">Không rõ</span><span class="stat-value">${unknown}</span></div>
            </div>
        </div>

        <div class="import-section">
            <h2>Theo Domain</h2>
            ${renderBarChart(byDomain, total)}
        </div>

        <div class="import-section">
            <h2>Theo Rarity</h2>
            ${renderBarChart(byRarity, total)}
        </div>

        <div class="import-section">
            <h2>Theo Type</h2>
            ${renderBarChart(byType, total)}
        </div>
    `;
}

function renderBarChart(data, total) {
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
    return entries.map(([key, val]) => {
        const pct = total ? (val / total * 100).toFixed(1) : 0;
        return `
            <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span>${escapeHTML(key)}</span>
                    <span>${val} (${pct}%)</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); height: 8px; border-radius: 4px; overflow: hidden;">
                    <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #667eea, #764ba2);"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// UTIL
// ============================================
function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}