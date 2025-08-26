class FeatureStoreApp {
    constructor() {
        this.currentSchema = null;
        this.currentTable = null;
        this.initializeApp();
    }

    async initializeApp() {
        // Сначала тестируем подключение
        const connected = await this.testConnection();
        if (!connected) {
            this.showNotification('Не удалось подключиться к ClickHouse', 'error');
            return;
        }

        this.setupTabNavigation();
        await this.loadSchemas();
        this.setupEventListeners();
    }

    async testConnection() {
        try {
            const connected = await clickhouseAPI.testConnection();
            if (connected) {
                this.showNotification('Подключение к ClickHouse установлено', 'success');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    setupTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;

                // Обновляем активные кнопки
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Показываем соответствующий контент
                tabContents.forEach(content => content.classList.remove('active'));
                document.getElementById(tabId).classList.add('active');
            });
        });
    }

    async loadSchemas() {
        try {
            const schemas = await clickhouseAPI.getSchemas();
            const schemaSelects = document.querySelectorAll('select[id$="schema"]');

            schemaSelects.forEach(select => {
                // Сохраняем выбранное значение если есть
                const currentValue = select.value;
                select.innerHTML = '<option value="">Выберите схему</option>';

                schemas.forEach(schema => {
                    const option = document.createElement('option');
                    option.value = schema;
                    option.textContent = schema;
                    select.appendChild(option);
                });

                // Восстанавливаем выбранное значение если оно все еще существует
                if (schemas.includes(currentValue)) {
                    select.value = currentValue;
                }
            });
        } catch (error) {
            this.showNotification('Ошибка загрузки схем', 'error');
        }
    }

    async loadTables(schema, targetSelectId) {
        try {
            const tables = await clickhouseAPI.getTables(schema);
            const tableSelect = document.getElementById(targetSelectId);
            const currentValue = tableSelect.value;

            tableSelect.innerHTML = '<option value="">Выберите таблицу</option>';
            tables.forEach(table => {
                const option = document.createElement('option');
                option.value = table;
                option.textContent = table;
                tableSelect.appendChild(option);
            });

            if (tables.includes(currentValue)) {
                tableSelect.value = currentValue;
            }
        } catch (error) {
            this.showNotification('Ошибка загрузки таблиц', 'error');
        }
    }

    async loadTableFields(schema, table, targetSelectId) {
        try {
            const fields = await clickhouseAPI.getTableFields(schema, table);
            const fieldSelect = document.getElementById(targetSelectId);
            const currentValue = fieldSelect.value;

            fieldSelect.innerHTML = '<option value="">Выберите поле</option>';
            fields.forEach(field => {
                const option = document.createElement('option');
                option.value = field.name;
                option.textContent = `${field.name} (${field.type})`;
                fieldSelect.appendChild(option);
            });

            if (fields.some(f => f.name === currentValue)) {
                fieldSelect.value = currentValue;
            }
        } catch (error) {
            this.showNotification('Ошибка загрузки полей', 'error');
        }
    }

    setupEventListeners() {
        // Обработчики изменения схемы
        document.querySelectorAll('select[id$="schema"]').forEach(select => {
            select.addEventListener('change', async (e) => {
                const schema = e.target.value;
                const selectId = e.target.id;
                let tableSelectId;

                if (selectId === 'add-schema') tableSelectId = 'add-table';
                else if (selectId === 'remove-schema') tableSelectId = 'remove-table';
                else if (selectId === 'export-schema') tableSelectId = 'export-table';

                if (schema && tableSelectId) {
                    await this.loadTables(schema, tableSelectId);
                }
            });
        });

        // Обработчики изменения таблицы
        document.getElementById('remove-table').addEventListener('change', async (e) => {
            const schema = document.getElementById('remove-schema').value;
            const table = e.target.value;
            if (schema && table) {
                await this.loadTableFields(schema, table, 'remove-field-name');
            }
        });

        document.getElementById('export-table').addEventListener('change', async (e) => {
            const schema = document.getElementById('export-schema').value;
            const table = e.target.value;
            if (schema && table) {
                await this.loadTableFields(schema, table, 'time-field');
            }
        });

        // Обработчик добавления поля
        document.getElementById('add-field-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleAddField();
        });

        // Обработчик удаления поля
        document.getElementById('remove-field-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleRemoveField();
        });

        // Обработчик выгрузки данных
        document.getElementById('export-data-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleExportData();
        });
    }

    async handleAddField() {
        const schema = document.getElementById('add-schema').value;
        const table = document.getElementById('add-table').value;
        const fieldName = document.getElementById('field-name').value;
        const fieldType = document.getElementById('field-type').value;

        try {
            await clickhouseAPI.addField(schema, table, fieldName, fieldType);
            this.showNotification('Поле успешно добавлено', 'success');
            document.getElementById('add-field-form').reset();
        } catch (error) {
            this.showNotification('Ошибка добавления поля', 'error');
        }
    }

    async handleRemoveField() {
        const schema = document.getElementById('remove-schema').value;
        const table = document.getElementById('remove-table').value;
        const fieldName = document.getElementById('remove-field-name').value;

        try {
            await clickhouseAPI.removeField(schema, table, fieldName);
            this.showNotification('Поле успешно удалено', 'success');
            // Перезагружаем список полей
            await this.loadTableFields(schema, table, 'remove-field-name');
        } catch (error) {
            this.showNotification('Ошибка удаления поля', 'error');
        }
    }

    async handleExportData() {
        const schema = document.getElementById('export-schema').value;
        const table = document.getElementById('export-table').value;
        const fields = document.getElementById('export-fields').value;
        const timeField = document.getElementById('time-field').value;
        const startTime = document.getElementById('start-time').value;
        const endTime = document.getElementById('end-time').value;

        try {
            // Преобразуем формат даты-времени для ClickHouse
            const formatForClickHouse = (datetimeString) => {
                if (!datetimeString) return '';
                // Преобразуем "2025-08-26T17:43" в "2025-08-26 17:43:00"
                return datetimeString.replace('T', ' ') + ':00';
            };

            const formattedStartTime = formatForClickHouse(startTime);
            const formattedEndTime = formatForClickHouse(endTime);

            console.log('Formatted times:', { start: formattedStartTime, end: formattedEndTime });

            const csvData = await clickhouseAPI.exportData(
                schema, table, fields, timeField, formattedStartTime, formattedEndTime
            );

            this.downloadCSV(csvData, `${schema}_${table}_export.csv`);
            this.showNotification('Данные успешно выгружены', 'success');
        } catch (error) {
            console.error('Ошибка выгрузки данных:', error);
            this.showNotification('Ошибка выгрузки данных: ' + error.message, 'error');
        }
    }

    downloadCSV(data, filename) {
        const blob = new Blob([data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    showNotification(message, type) {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;

        // Показываем уведомление
        setTimeout(() => {
            notification.classList.remove('hidden');
        }, 100);

        // Скрываем через 3 секунды
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
    }
}

// Инициализация приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new FeatureStoreApp();
});