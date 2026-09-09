cmake_minimum_required(VERSION 3.10)
project(RiftboundDatabase)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Dependencies
find_package(CURL REQUIRED)
find_package(SQLite3 REQUIRED)

# Add nlohmann/json as subdirectory if you have it
# Or download from: https://github.com/nlohmann/json/releases
include_directories(${CMAKE_SOURCE_DIR}/third_party/include)

add_executable(riftbound_db 
    main.cpp
    card_database.cpp
)

target_link_libraries(riftbound_db 
    ${CURL_LIBRARIES}
    ${SQLite3_LIBRARIES}
    pthread
)

# Or using conan/vcpkg
# find_package(nlohmann_json REQUIRED)
# target_link_libraries(riftbound_db nlohmann_json::nlohmann_json)