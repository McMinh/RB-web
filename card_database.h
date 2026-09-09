// card_database.h
#ifndef CARD_DATABASE_H
#define CARD_DATABASE_H

#include <string>
#include <vector>
#include <map>
#include <sqlite3.h>
#include "json.hpp"

using json = nlohmann::json;

// Struct định nghĩa card
struct Card {
    std::string id;
    std::string name;
    std::string set;
    std::string setCode;
    std::string rarity;
    std::string type;
    std::string domain;
    int energy;          // Unit-only
    int might;           // Spell/Gear
    int power;           // Unit-only
    std::string text;
    double marketPrice;
    std::string tcgplayerProductId;
    std::string imageUrl;
    long long lastUpdated;
};

// Struct cho price history
struct PriceHistory {
    std::string cardId;
    double marketPrice;
    double lowPrice;
    double highPrice;
    long long timestamp;
};

class CardDatabase {
private:
    sqlite3* db;
    std::string dbPath;

    // Helper methods
    void createTables();
    void executeSQL(const std::string& sql);

public:
    // Constructor & Destructor
    CardDatabase(const std::string& path = "riftbound.db");
    ~CardDatabase();

    // Card operations
    void insertCard(const Card& card);
    void insertCards(const std::vector<Card>& cards);
    Card getCard(const std::string& id);
    Card getCardByName(const std::string& name);
    std::vector<Card> getCardsBySet(const std::string& setCode);
    std::vector<Card> getCardsByRarity(const std::string& rarity);
    std::vector<Card> getAllCards();
    void updateCard(const Card& card);
    void deleteCard(const std::string& id);
    bool cardExists(const std::string& id);

    // Price operations
    void updatePrice(const std::string& cardId, double marketPrice, double lowPrice, double highPrice);
    double getLatestPrice(const std::string& cardId);
    PriceHistory getPriceHistory(const std::string& cardId, int limit = 30);
    std::vector<PriceHistory> getPriceHistoryRange(const std::string& cardId, long long from, long long to);

    // Search operations
    std::vector<Card> searchCards(const std::string& query);
    std::vector<Card> filterCards(const std::map<std::string, std::string>& filters);

    // Import/Export
    void importFromJSON(const std::string& jsonPath);
    void exportToJSON(const std::string& jsonPath);
    void exportPricesToJSON(const std::string& jsonPath);

    // Statistics
    int getCardCount();
    std::map<std::string, int> getSetStatistics();
    std::map<std::string, double> getAveragePricesByRarity();

    // Database maintenance
    void vacuum();
    void backup(const std::string& backupPath);
    void clearPriceHistory();

    // Transaction support
    void beginTransaction();
    void commitTransaction();
    void rollbackTransaction();

private:
    // Internal helper methods
    Card rowToCard(sqlite3_stmt* stmt);
    void bindCardParams(sqlite3_stmt* stmt, const Card& card, bool isUpdate = false);
};

#endif // CARD_DATABASE_H