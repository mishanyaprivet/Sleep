// Навчальна програма: стиснення рядка методом RLE (run-length encoding).
// Кожна послідовність однакових символів замінюється на символ
// і кількість його повторень: "aaabccdddd" -> "a3b1c2d4".
//
// Компіляція: g++ -std=c++17 -Wall -Wextra -o rle rle.cpp

#include <cassert>
#include <iostream>
#include <string>

// Рекурсивне RLE-кодування (без циклів).
//   s     — вхідний рядок
//   i     — індекс поточного символу
//   count — скільки разів поспіль уже зустрівся символ s[i]
std::string rle(const std::string& s, size_t i = 0, int count = 1) {
    // Базовий випадок: рядок закінчився.
    if (i >= s.size()) {
        return "";
    }

    // Серія закінчується: це останній символ або наступний символ інший.
    // Записуємо символ і довжину серії, а далі починаємо нову серію з count = 1.
    if (i + 1 == s.size() || s[i] != s[i + 1]) {
        return s[i] + std::to_string(count) + rle(s, i + 1, 1);
    }

    // Серія триває: переходимо до наступного символу, збільшивши лічильник.
    return rle(s, i + 1, count + 1);
}

// Тести з прикладів завдання.
void runTests() {
    assert(rle("aaaaaa") == "a6");
    assert(rle("aaabccdddd") == "a3b1c2d4");
    assert(rle("") == "");
    std::cout << "Усі тести пройдено!\n";
}

int main() {
    runTests();

    std::cout << "Введіть рядок: ";
    std::string input;
    std::getline(std::cin, input);

    std::cout << "Результат RLE: " << rle(input) << '\n';
    return 0;
}
