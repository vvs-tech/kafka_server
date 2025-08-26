const CLICKHOUSE_URL = 'http://localhost:8123';

class ClickHouseAPI {
    constructor() {
        this.auth = 'Basic ' + btoa('default:default');
    }

    async executeQuery(query) {
        console.log('Executing ClickHouse query:', query);

        try {
            const response = await fetch(CLICKHOUSE_URL, {
                method: 'POST',
                headers: {
                    'Authorization': this.auth,
                    'Content-Type': 'text/plain',
                    'X-ClickHouse-Format': 'JSON' // Убедимся, что формат JSON
                },
                body: query
            });

            console.log('Response status:', response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('ClickHouse error response:', errorText);
                throw new Error(`ClickHouse error: ${response.status} - ${errorText}`);
            }

            // Пробуем разные форматы ответа
            const contentType = response.headers.get('content-type');
            console.log('Content-Type:', contentType);

            let result;
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const text = await response.text();
                console.log('Raw response text:', text);

                // Пробуем распарсить как JSON, если это JSON
                try {
                    result = JSON.parse(text);
                } catch (e) {
                    // Если не JSON, возвращаем как текст
                    result = text;
                }
            }

            console.log('Query result:', result);
            return result;

        } catch (error) {
            console.error('ClickHouse query failed:', error);
            throw error;
        }
    }

    // Получение списка схем
    async getSchemas() {
        try {
            const query = `SELECT name FROM system.databases WHERE name NOT IN ('system', 'information_schema') FORMAT JSON`;
            const result = await this.executeQuery(query);

            // Обрабатываем разные форматы ответа
            if (Array.isArray(result)) {
                return result.map(row => row.name);
            } else if (result && result.data) {
                // Формат {data: [...]}
                return result.data.map(row => row.name);
            } else if (result && typeof result === 'object') {
                // Пробуем найти массив в объекте
                for (const key in result) {
                    if (Array.isArray(result[key])) {
                        return result[key].map(row => row.name || row);
                    }
                }
            }

            console.error('Unexpected response format:', result);
            throw new Error('Unexpected response format from ClickHouse');

        } catch (error) {
            console.error('Failed to get schemas:', error);
            throw error;
        }
    }

    // Получение списка таблиц в схеме
    async getTables(schema) {
        try {
            const query = `SELECT name FROM system.tables WHERE database = '${schema}' FORMAT JSON`;
            const result = await this.executeQuery(query);

            if (Array.isArray(result)) {
                return result.map(row => row.name);
            } else if (result && result.data) {
                return result.data.map(row => row.name);
            }

            console.error('Unexpected response format for tables:', result);
            return [];

        } catch (error) {
            console.error(`Failed to get tables for schema ${schema}:`, error);
            throw error;
        }
    }

    // Получение списка полей таблицы
    async getTableFields(schema, table) {
        try {
            const query = `
                SELECT name, type 
                FROM system.columns 
                WHERE database = '${schema}' AND table = '${table}'
                ORDER BY position
                FORMAT JSON
            `;
            const result = await this.executeQuery(query);

            if (Array.isArray(result)) {
                return result;
            } else if (result && result.data) {
                return result.data;
            }

            console.error('Unexpected response format for fields:', result);
            return [];

        } catch (error) {
            console.error(`Failed to get fields for ${schema}.${table}:`, error);
            throw error;
        }
    }

    // Добавление поля в таблицу
    async addField(schema, table, fieldName, fieldType) {
        try {
            const query = `ALTER TABLE ${schema}.${table} ADD COLUMN ${fieldName} ${fieldType}`;
            await this.executeQuery(query);
            console.log(`Field ${fieldName} added to ${schema}.${table}`);
        } catch (error) {
            console.error(`Failed to add field ${fieldName} to ${schema}.${table}:`, error);
            throw error;
        }
    }

    // Удаление поля из таблицы
    async removeField(schema, table, fieldName) {
        try {
            const query = `ALTER TABLE ${schema}.${table} DROP COLUMN ${fieldName}`;
            await this.executeQuery(query);
            console.log(`Field ${fieldName} removed from ${schema}.${table}`);
        } catch (error) {
            console.error(`Failed to remove field ${fieldName} from ${schema}.${table}:`, error);
            throw error;
        }
    }

    // Выборка данных
    async exportData(schema, table, fields, timeField, startTime, endTime) {
        try {
            const fieldList = fields.split(',').map(f => f.trim()).join(', ');
            const query = `
                SELECT ${fieldList}
                FROM ${schema}.${table}
                WHERE ${timeField} >= '${startTime}' AND ${timeField} <= '${endTime}'
                FORMAT CSVWithNames
            `;

            console.log('Export query:', query);

            const response = await fetch(CLICKHOUSE_URL, {
                method: 'POST',
                headers: {
                    'Authorization': this.auth,
                    'Content-Type': 'text/plain'
                },
                body: query
            });

            console.log('Export response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Export error:', errorText);
                throw new Error(`Export failed: ${response.status} - ${errorText}`);
            }

            const data = await response.text();
            console.log('Export data received, length:', data.length);
            return data;

        } catch (error) {
            console.error('Export failed:', error);
            throw error;
        }
    }

    // Новая функция для тестирования подключения
    async testConnection() {
        try {
            const query = 'SELECT 1 as test FORMAT JSON';
            const result = await this.executeQuery(query);
            console.log('Connection test result:', result);
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }
}

// Создаем глобальный экземпляр API
const clickhouseAPI = new ClickHouseAPI();