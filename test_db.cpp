// test_db.cpp
#include "card_database.h"
#include <iostream>

int main() {
    try {
        CardDatabase db("test.db");
        
        // Tạo card test
        Card testCard;
        testCard.id = "TEST-001";
        testCard.name = "Test Dragon";
        testCard.set = "Test Set";
        testCard.setCode = "TS1";
        testCard.rarity = "Rare";
        testCard.type = "Unit";
        testCard.domain = "Dragon";
        testCard.energy = 5;
        testCard.might = 3;
        testCard.power = 4;
        testCard.text = "This is a test card";
        testCard.tcgplayerProductId = "12345";
        
        // Insert
        db.insertCard(testCard);
        std::cout << "Inserted test card" << std::endl;
        
        // Retrieve
        auto card = db.getCard("TEST-001");
        std::cout << "Retrieved: " << card.name << std::endl;
        
        // Update price
        db.updatePrice("TEST-001", 10.50, 8.00, 12.00);
        std::cout << "Updated price: $" << db.getLatestPrice("TEST-001") << std::endl;
        
        // Search
        auto results = db.searchCards("Test");
        std::cout << "Found " << results.size() << " cards" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}