// main.cpp
#include "card_database.h"
#include <iostream>
#include <curl/curl.h>
#include "json.hpp"

using json = nlohmann::json;

// HTTP client cho TCGplayer API (giống như trước)
class TCGPlayerAPI {
private:
    std::string apiKey;
    std::string baseUrl = "https://api.tcgplayer.com/v1.37.0";

    static size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
        ((std::string*)userp)->append((char*)contents, size * nmemb);
        return size * nmemb;
    }

public:
    TCGPlayerAPI(const std::string& key) : apiKey(key) {}

    json getProductPrices(const std::string& productId) {
        CURL* curl = curl_easy_init();
        std::string response;
        std::string url = baseUrl + "/catalog/products/" + productId;

        if (!curl) throw std::runtime_error("CURL init failed");

        struct curl_slist* headers = nullptr;
        headers = curl_slist_append(headers, ("Authorization: Bearer " + apiKey).c_str());
        headers = curl_slist_append(headers, "Content-Type: application/json");

        curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);

        CURLcode res = curl_easy_perform(curl);
        curl_easy_cleanup(curl);
        curl_slist_free_all(headers);

        if (res != CURLE_OK) {
            throw std::runtime_error("HTTP request failed");
        }

        return json::parse(response);
    }
};

int main() {
    try {
        // 1. Khởi tạo database
        CardDatabase db("riftbound.db");
        std::cout << "Database initialized" << std::endl;

        // 2. Import dữ liệu card từ JSON
        db.importFromJSON("cards.json");
        
        // 3. Hiển thị thống kê
        std::cout << "Total cards: " << db.getCardCount() << std::endl;
        std::cout << "\nCards by set:" << std::endl;
        auto setStats = db.getSetStatistics();
        for (const auto& [setCode, count] : setStats) {
            std::cout << "  " << setCode << ": " << count << " cards" << std::endl;
        }

        // 4. Lấy giá từ TCGplayer và update
        TCGPlayerAPI tcgAPI("YOUR_API_KEY");
        auto cards = db.getAllCards();
        
        std::cout << "\nUpdating prices from TCGplayer..." << std::endl;
        db.beginTransaction();
        
        int updated = 0;
        for (const auto& card : cards) {
            if (!card.tcgplayerProductId.empty()) {
                try {
                    auto priceData = tcgAPI.getProductPrices(card.tcgplayerProductId);
                    
                    // Parse price từ response
                    double marketPrice = priceData["results"][0]["marketPrice"];
                    double lowPrice = priceData["results"][0]["lowPrice"];
                    double highPrice = priceData["results"][0]["highPrice"];
                    
                    db.updatePrice(card.id, marketPrice, lowPrice, highPrice);
                    updated++;
                    
                    if (updated % 10 == 0) {
                        std::cout << "Updated " << updated << " cards..." << std::endl;
                    }
                } catch (const std::exception& e) {
                    std::cerr << "Error updating " << card.name << ": " << e.what() << std::endl;
                }
            }
        }
        
        db.commitTransaction();
        std::cout << "Updated prices for " << updated << " cards" << std::endl;

        // 5. Export dữ liệu với giá
        db.exportToJSON("riftbound_cards_with_prices.json");
        db.exportPricesToJSON("price_history.json");

        // 6. Tìm kiếm demo
        std::cout << "\nSearching for 'Dragon'..." << std::endl;
        auto results = db.searchCards("Dragon");
        for (const auto& card : results) {
            std::cout << "  " << card.name << " - $" << card.marketPrice << std::endl;
        }

        // 7. Backup database
        db.backup("riftbound_backup.db");
        std::cout << "\nDatabase backup created" << std::endl;

    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}