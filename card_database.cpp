// card_database.cpp
#include "card_database.h"
#include <iostream>
#include <fstream>
#include <stdexcept>
#include <ctime>
#include <algorithm>

CardDatabase::CardDatabase(const std::string& path) : dbPath(path) {
    if (sqlite3_open(dbPath.c_str(), &db) != SQLITE_OK) {
        throw std::runtime_error("Cannot open database: " + std::string(sqlite3_errmsg(db)));
    }
    createTables();
}

CardDatabase::~CardDatabase() {
    if (db) {
        sqlite3_close(db);
    }
}

void CardDatabase::executeSQL(const std::string& sql) {
    char* errMsg = nullptr;
    if (sqlite3_exec(db, sql.c_str(), nullptr, nullptr, &errMsg) != SQLITE_OK) {
        std::string err = errMsg;
        sqlite3_free(errMsg);
        throw std::runtime_error("SQL execution failed: " + err);
    }
}

void CardDatabase::createTables() {
    // Bảng cards - lưu thông tin cơ bản của card
    const std::string createCardsTable = R"(
        CREATE TABLE IF NOT EXISTS cards (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            set_name TEXT,
            set_code TEXT,
            rarity TEXT,
            card_type TEXT,
            domain TEXT,
            energy INTEGER,
            might INTEGER,
            power INTEGER,
            card_text TEXT,
            tcgplayer_product_id TEXT,
            image_url TEXT,
            last_updated INTEGER
        )
    )";

    // Bảng prices - lưu lịch sử giá
    const std::string createPricesTable = R"(
        CREATE TABLE IF NOT EXISTS prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id TEXT,
            market_price REAL,
            low_price REAL,
            high_price REAL,
            updated_at INTEGER,
            FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
        )
    )";

    // Bảng sets - lưu thông tin về các set
    const std::string createSetsTable = R"(
        CREATE TABLE IF NOT EXISTS sets (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            release_date INTEGER,
            total_cards INTEGER,
            is_standard BOOLEAN DEFAULT 1
        )
    )";

    // Indexes để tăng performance
    const std::string createIndexes = R"(
        CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
        CREATE INDEX IF NOT EXISTS idx_cards_set ON cards(set_code);
        CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);
        CREATE INDEX IF NOT EXISTS idx_prices_card_id ON prices(card_id);
        CREATE INDEX IF NOT EXISTS idx_prices_updated_at ON prices(updated_at);
    )";

    executeSQL(createCardsTable);
    executeSQL(createPricesTable);
    executeSQL(createSetsTable);
    executeSQL(createIndexes);
}

Card CardDatabase::rowToCard(sqlite3_stmt* stmt) {
    Card card;
    card.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
    card.name = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
    card.set = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
    card.setCode = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
    card.rarity = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
    card.type = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 5));
    card.domain = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 6));
    card.energy = sqlite3_column_int(stmt, 7);
    card.might = sqlite3_column_int(stmt, 8);
    card.power = sqlite3_column_int(stmt, 9);
    card.text = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 10));
    card.tcgplayerProductId = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 11));
    card.imageUrl = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 12));
    card.lastUpdated = sqlite3_column_int64(stmt, 13);

    // Lấy giá mới nhất từ bảng prices
    card.marketPrice = getLatestPrice(card.id);
    
    return card;
}

void CardDatabase::insertCard(const Card& card) {
    const char* sql = R"(
        INSERT OR REPLACE INTO cards 
        (id, name, set_name, set_code, rarity, card_type, domain, energy, might, power, card_text, tcgplayer_product_id, image_url, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    )";

    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        throw std::runtime_error("Prepare insert statement failed: " + std::string(sqlite3_errmsg(db)));
    }

    sqlite3_bind_text(stmt, 1, card.id.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, card.name.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 3, card.set.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 4, card.setCode.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 5, card.rarity.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 6, card.type.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 7, card.domain.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 8, card.energy);
    sqlite3_bind_int(stmt, 9, card.might);
    sqlite3_bind_int(stmt, 10, card.power);
    sqlite3_bind_text(stmt, 11, card.text.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 12, card.tcgplayerProductId.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 13, card.imageUrl.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_int64(stmt, 14, time(nullptr));

    if (sqlite3_step(stmt) != SQLITE_DONE) {
        sqlite3_finalize(stmt);
        throw std::runtime_error("Insert failed: " + std::string(sqlite3_errmsg(db)));
    }
    sqlite3_finalize(stmt);
}

void CardDatabase::insertCards(const std::vector<Card>& cards) {
    beginTransaction();
    try {
        for (const auto& card : cards) {
            insertCard(card);
        }
        commitTransaction();
    } catch (...) {
        rollbackTransaction();
        throw;
    }
}

Card CardDatabase::getCard(const std::string& id) {
    const char* sql = "SELECT * FROM cards WHERE id = ?";
    sqlite3_stmt* stmt;
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        throw std::runtime_error("Prepare select failed: " + std::string(sqlite3_errmsg(db)));
    }

    sqlite3_bind_text(stmt, 1, id.c_str(), -1, SQLITE_STATIC);

    Card card;
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        card = rowToCard(stmt);
    } else {
        sqlite3_finalize(stmt);
        throw std::runtime_error("Card not found: " + id);
    }

    sqlite3_finalize(stmt);
    return card;
}

Card CardDatabase::getCardByName(const std::string& name) {
    const char* sql = "SELECT * FROM cards WHERE name = ? LIMIT 1";
    sqlite3_stmt* stmt;
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        throw std::runtime_error("Prepare select failed: " + std::string(sqlite3_errmsg(db)));
    }

    sqlite3_bind_text(stmt, 1, name.c_str(), -1, SQLITE_STATIC);

    Card card;
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        card = rowToCard(stmt);
    } else {
        sqlite3_finalize(stmt);
        throw std::runtime_error("Card not found: " + name);
    }

    sqlite3_finalize(stmt);
    return card;
}

std::vector<Card> CardDatabase::getCardsBySet(const std::string& setCode) {
    const char* sql = "SELECT * FROM cards WHERE set_code = ? ORDER BY name";
    sqlite3_stmt* stmt;
    std::vector<Card> cards;
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        throw std::runtime_error("Prepare select failed: " + std::string(sqlite3_errmsg(db)));
    }

    sqlite3_bind_text(stmt, 1, setCode.c_str(), -1, SQLITE_STATIC);

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        cards.push_back(rowToCard(stmt));
    }

    sqlite3_finalize(stmt);
    return cards;
}

std::vector<Card> CardDatabase::getCardsByRarity(const std::string& rarity) {
    const char* sql = "SELECT * FROM cards WHERE rarity = ? ORDER BY name";
    sqlite3_stmt* stmt;
    std::vector<Card> cards;
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        throw std::runtime_error("Prepare select failed: " + std::string(sqlite3_errmsg(db)));
    }

    sqlite3_bind_text(stmt, 1, rarity.c_str(), -1, SQLITE_STATIC);

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        cards.push_back(rowToCard(stmt));
    }

    sqlite3_finalize(stmt);
    return cards;
}

std::vector<Card> CardDatabase::getAllCards() {
    const char* sql = "SELECT * FROM cards ORDER BY name";
    sqlite3_stmt* stmt;
    std::vector<Card> cards;
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        throw std::runtime_error("Prepare select failed: " + std::string(sqlite3_errmsg(db)));
    }

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        cards.push_back(rowToCard(stmt));
    }

    sqlite3_finalize(stmt);
    return cards;
}

void CardDatabase::updateCard(const Card& card) {
    insertCard(card); // REPLACE sẽ update nếu tồn tại
}

void CardDatabase::deleteCard(const std::string& id) {
    const char* sql = "DELETE FROM cards WHERE id = ?";
    sqlite3_stmt* stmt;
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        throw std::runtime_error("Prepare delete failed: " + std::string(sqlite3_errmsg(db)));
    }

    sqlite3_bind_text(stmt, 1, id.c_str(), -1, SQLITE_STATIC);

    if (sqlite3_step(stmt) != SQLITE_DONE) {
        sqlite3_finalize(stmt);
        throw std::runtime_error("Delete failed: " + std::string(sqlite3_errmsg(db)));
    }

    sqlite3_finalize(stmt);
}

bool CardDatabase::cardExists(const std::string& id) {
    const char* sql = "SELECT COUNT(*) FROM cards WHERE id = ?";
    sqlite3_stmt* stmt;
    bool exists = false;
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        throw std::runtime_error("Prepare select failed: " + std::string(sqlite3_errmsg(db)));
    }

    sqlite3_bind_text(stmt, 1, id.c_str(), -1, SQLITE_STATIC);

    if (sqlite3_step(stmt) == SQLITE_ROW) {
        exists = sqlite3_column_int(stmt, 0) > 0;
    }

    sqlite3_finalize(stmt);
    return exists;
}

void CardDatabase::updatePrice(const std::string& cardId, double marketPrice, double lowPrice, double highPrice) {
    const char* sql = R"(
        INSERT INTO prices (card_id, market_price, low_price, high_price, updated_at)
        VALUES (?, ?, ?, ?, ?)
    )";

    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        throw std::runtime_error("Prepare price statement failed: " + std::string(sqlite3_errmsg(db)));
    }

    sqlite3_bind_text(stmt, 1, cardId.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_double(stmt, 2, marketPrice);
    sqlite3_bind_double(stmt, 3, lowPrice);
    sqlite3_bind_double(stmt, 4, highPrice);
    sqlite3_bind_int64(stmt, 5, time(nullptr));

    if (sqlite3_step(stmt) != SQLITE_DONE) {
        sqlite3_finalize(stmt);
        throw std::runtime_error("Price insert failed: " + std::string(sqlite3_errmsg(db)));
    }

    sqlite3_finalize(stmt);

    // Cập nhật marketPrice trong bảng cards
    const char* updateCard = "UPDATE cards SET last_updated = ? WHERE id = ?";
    if (sqlite3_prepare_v2(db, updateCard, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_int64(stmt, 1, time(nullptr));
        sqlite3_bind_text(stmt, 2, cardId.c_str(), -1, SQLITE_STATIC);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
}

double CardDatabase::getLatestPrice(const std::string& cardId) {
    const char* sql = "SELECT market_price FROM prices WHERE card_id = ? ORDER BY updated_at DESC LIMIT 1";
    sqlite3_stmt* stmt;
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        return 0.0;
    }

    sqlite3_bind_text(stmt, 1, cardId.c_str(), -1, SQLITE_STATIC);

    double price = 0.0;
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        price = sqlite3_column_double(stmt, 0);
    }

    sqlite3_finalize(stmt);
    return price;
}

PriceHistory CardDatabase::getPriceHistory(const std::string& cardId, int limit) {
    PriceHistory history;
    history.cardId = cardId;
    
    // Get latest price
    const char* sql = "SELECT market_price, low_price, high_price, updated_at FROM prices WHERE card_id = ? ORDER BY updated_at DESC LIMIT ?";
    sqlite3_stmt* stmt;
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        return history;
    }

    sqlite3_bind_text(stmt, 1, cardId.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 2, limit);

    // TODO: Store in vector if needed
    // For now just return latest
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        history.marketPrice = sqlite3_column_double(stmt, 0);
        history.lowPrice = sqlite3_column_double(stmt, 1);
        history.highPrice = sqlite3_column_double(stmt, 2);
        history.timestamp = sqlite3_column_int64(stmt, 3);
    }

    sqlite3_finalize(stmt);
    return history;
}

std::vector<Card> CardDatabase::searchCards(const std::string& query) {
    const char* sql = R"(
        SELECT * FROM cards 
        WHERE name LIKE ? 
           OR card_text LIKE ? 
           OR set_name LIKE ?
        ORDER BY name
    )";
    
    sqlite3_stmt* stmt;
    std::vector<Card> cards;
    std::string searchPattern = "%" + query + "%";
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        throw std::runtime_error("Prepare search failed: " + std::string(sqlite3_errmsg(db)));
    }

    sqlite3_bind_text(stmt, 1, searchPattern.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, searchPattern.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 3, searchPattern.c_str(), -1, SQLITE_STATIC);

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        cards.push_back(rowToCard(stmt));
    }

    sqlite3_finalize(stmt);
    return cards;
}

std::vector<Card> CardDatabase::filterCards(const std::map<std::string, std::string>& filters) {
    std::string sql = "SELECT * FROM cards WHERE 1=1";
    std::vector<std::string> params;
    
    for (const auto& [key, value] : filters) {
        if (key == "set") {
            sql += " AND set_code = ?";
        } else if (key == "rarity") {
            sql += " AND rarity = ?";
        } else if (key == "type") {
            sql += " AND card_type = ?";
        } else if (key == "domain") {
            sql += " AND domain = ?";
        } else {
            continue;
        }
        params.push_back(value);
    }
    sql += " ORDER BY name";

    sqlite3_stmt* stmt;
    std::vector<Card> cards;
    
    if (sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) {
        throw std::runtime_error("Prepare filter failed: " + std::string(sqlite3_errmsg(db)));
    }

    for (size_t i = 0; i < params.size(); ++i) {
        sqlite3_bind_text(stmt, i + 1, params[i].c_str(), -1, SQLITE_STATIC);
    }

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        cards.push_back(rowToCard(stmt));
    }

    sqlite3_finalize(stmt);
    return cards;
}

void CardDatabase::importFromJSON(const std::string& jsonPath) {
    std::ifstream f(jsonPath);
    if (!f.is_open()) {
        throw std::runtime_error("Cannot open JSON file: " + jsonPath);
    }

    json data = json::parse(f);
    std::vector<Card> cards;

    for (auto& item : data) {
        Card card;
        card.id = item.value("id", "");
        card.name = item.value("name", "");
        card.set = item.value("set", "");
        card.setCode = item.value("setCode", "");
        card.rarity = item.value("rarity", "");
        card.type = item.value("type", "");
        card.domain = item.value("domain", "");
        card.energy = item.value("energy", 0);
        card.might = item.value("might", 0);
        card.power = item.value("power", 0);
        card.text = item.value("text", "");
        card.tcgplayerProductId = item.value("tcgplayerProductId", "");
        card.imageUrl = item.value("imageUrl", "");
        card.marketPrice = 0.0;
        card.lastUpdated = time(nullptr);
        cards.push_back(card);
    }

    insertCards(cards);
    std::cout << "Imported " << cards.size() << " cards from " << jsonPath << std::endl;
}

void CardDatabase::exportToJSON(const std::string& jsonPath) {
    auto cards = getAllCards();
    json output = json::array();

    for (const auto& card : cards) {
        json item;
        item["id"] = card.id;
        item["name"] = card.name;
        item["set"] = card.set;
        item["setCode"] = card.setCode;
        item["rarity"] = card.rarity;
        item["type"] = card.type;
        item["domain"] = card.domain;
        item["energy"] = card.energy;
        item["might"] = card.might;
        item["power"] = card.power;
        item["text"] = card.text;
        item["tcgplayerProductId"] = card.tcgplayerProductId;
        item["imageUrl"] = card.imageUrl;
        item["marketPrice"] = card.marketPrice;
        output.push_back(item);
    }

    std::ofstream f(jsonPath);
    f << output.dump(4);
    std::cout << "Exported " << cards.size() << " cards to " << jsonPath << std::endl;
}

void CardDatabase::beginTransaction() {
    executeSQL("BEGIN TRANSACTION");
}

void CardDatabase::commitTransaction() {
    executeSQL("COMMIT");
}

void CardDatabase::rollbackTransaction() {
    executeSQL("ROLLBACK");
}

int CardDatabase::getCardCount() {
    const char* sql = "SELECT COUNT(*) FROM cards";
    sqlite3_stmt* stmt;
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        return 0;
    }

    int count = 0;
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        count = sqlite3_column_int(stmt, 0);
    }

    sqlite3_finalize(stmt);
    return count;
}

std::map<std::string, int> CardDatabase::getSetStatistics() {
    const char* sql = "SELECT set_code, COUNT(*) FROM cards GROUP BY set_code";
    sqlite3_stmt* stmt;
    std::map<std::string, int> stats;
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        return stats;
    }

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        std::string setCode = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
        int count = sqlite3_column_int(stmt, 1);
        stats[setCode] = count;
    }

    sqlite3_finalize(stmt);
    return stats;
}

void CardDatabase::vacuum() {
    executeSQL("VACUUM");
}

void CardDatabase::backup(const std::string& backupPath) {
    sqlite3* backupDb;
    if (sqlite3_open(backupPath.c_str(), &backupDb) != SQLITE_OK) {
        throw std::runtime_error("Cannot open backup database");
    }

    sqlite3_backup* backup = sqlite3_backup_init(backupDb, "main", db, "main");
    if (backup) {
        sqlite3_backup_step(backup, -1);
        sqlite3_backup_finish(backup);
    }

    sqlite3_close(backupDb);
}