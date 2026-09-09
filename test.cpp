#define CURL_STATICLIB // Quan trọng nếu bạn dùng libcurl static
#include <curl/curl.h>
#include <iostream>

int main() {
    CURL* curl = curl_easy_init();
    if(curl) {
        std::cout << "libcurl initialized successfully!" << std::endl;
        curl_easy_cleanup(curl);
    } else {
        std::cout << "Failed to initialize libcurl!" << std::endl;
    }
    return 0;
}