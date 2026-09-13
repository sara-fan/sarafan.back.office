# Sarafan Back Office

[![ci](https://github.com/sara-fan/sarafan.back.office/actions/workflows/ci.yml/badge.svg)](https://github.com/sara-fan/sarafan.back.office/actions/workflows/ci.yml)
[![publish](https://github.com/sara-fan/sarafan.back.office/actions/workflows/publish.yml/badge.svg)](https://github.com/sara-fan/sarafan.back.office/actions/workflows/publish.yml)
[![codecov](https://codecov.io/gh/sara-fan/sarafan.back.office/graph/badge.svg?token=u3gQ7usaRT)](https://codecov.io/gh/sara-fan/sarafan.back.office)

Sarafan Back Office — внутреннее веб-приложение для сотрудников «Сарафана», прототипа сервиса помощи в покупке и доставке товаров из зарубежных интернет-магазинов. Администраторы управляют учётными записями и ролями сотрудников, публикуют юридические документы и просматривают историю их изменений. Уполномоченные сотрудники работают с очередью обращений по обработке персональных данных; пользователям также доступны настройки профиля и официальный курс USD/RUB Банка России.

Приложение построено на Vue 3 и Vuetify, использует отдельный API сотрудников Sarafan Core и вход по электронной почте и паролю. Доступ к функциям определяется ролями: администратор, руководитель смены, старший оператор и оператор. Back Office развёртывается отдельным Docker-контейнером на домене `sb.sw.consulting`.

