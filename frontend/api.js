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

    // функция для тестирования подключения
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

    // Получение списка моделей
    async getModels() {
        try {
            const query = `
            SELECT model_id, model_name, is_active, process_dttm 
            FROM feature_store.ref_model 
            ORDER BY model_id
            FORMAT JSON
        `;
            const result = await this.executeQuery(query);

            if (result && result.data) {
                return result.data;
            }
            return [];

        } catch (error) {
            console.error('Failed to get models:', error);
            throw error;
        }
    }

    // Проверка существования модели по имени
    async checkModelExists(modelName) {
        try {
            const query = `
            SELECT COUNT() as count 
            FROM feature_store.ref_model 
            WHERE model_name = '${modelName.replace(/'/g, "''")}'
            FORMAT JSON
        `;
            const result = await this.executeQuery(query);

            if (result && result.data && result.data[0]) {
                return result.data[0].count > 0;
            }
            return false;

        } catch (error) {
            console.error('Failed to check model existence:', error);
            throw error;
        }
    }

    // Получение следующего ID модели
    async getNextModelId() {
        try {
            const query = `
            SELECT COALESCE(MAX(model_id), 0) + 1 as next_id 
            FROM feature_store.ref_model 
            FORMAT JSON
        `;
            const result = await this.executeQuery(query);

            if (result && result.data && result.data[0]) {
                return result.data[0].next_id;
            }
            return 1;

        } catch (error) {
            console.error('Failed to get next model ID:', error);
            throw error;
        }
    }

    // Добавление новой модели
    async addModel(modelName) {
        try {
            const nextId = await this.getNextModelId();
            const query = `
            INSERT INTO feature_store.ref_model (model_id, model_name, is_active, process_dttm)
            VALUES (${nextId}, '${modelName.replace(/'/g, "''")}', 1, now())
        `;

            await this.executeQuery(query);
            console.log(`Model ${modelName} added with ID ${nextId}`);
            return true;

        } catch (error) {
            console.error('Failed to add model:', error);
            throw error;
        }
    }

    // Деактивация модели
    async deactivateModel(modelId) {
        try {
            const query = `
            ALTER TABLE feature_store.ref_model 
            UPDATE is_active = 0 
            WHERE model_id = ${modelId}
        `;

            await this.executeQuery(query);
            console.log(`Model ${modelId} deactivated`);
            return true;

        } catch (error) {
            console.error('Failed to deactivate model:', error);
            throw error;
        }
    }


    // Создание таблицы dataset_meta если не существует
    async ensureDatasetMetaTable() {
        try {
            const query = `
            CREATE TABLE IF NOT EXISTS feature_store.dataset_meta
            (
                dataset_meta_id UInt64 not null, 
                user_id UInt64 not null,
                user_login String not null,
                model_id UInt64 not null,
                model_name String not null,
                dataset_script String not null,
                feature_num UInt16 not null,
                feature_list Array(String) not null,
                dataset_begin_dttm DateTime not null,
                dataset_end_dttm DateTime not null,
                description String null,
                dataset_dttm DateTime not null,
                process_dttm DateTime DEFAULT now()
            )
            ENGINE = MergeTree
            PARTITION BY (toYYYYMMDD(dataset_dttm)) 
            ORDER BY (model_id)
            SETTINGS index_granularity = 8192
        `;

            await this.executeQuery(query);
            console.log('Table feature_store.dataset_meta ensured');
            return true;

        } catch (error) {
            console.error('Failed to ensure dataset_meta table:', error);
            throw error;
        }
    }

    // Получение следующего ID для dataset_meta
    async getNextDatasetMetaId() {
        try {
            const query = `
            SELECT COALESCE(MAX(dataset_meta_id), 0) + 1 as next_id 
            FROM feature_store.dataset_meta 
            FORMAT JSON
        `;
            const result = await this.executeQuery(query);

            if (result && result.data && result.data[0]) {
                return result.data[0].next_id;
            }
            return 1;

        } catch (error) {
            console.error('Failed to get next dataset meta ID:', error);
            return 1;
        }
    }

    // Проверка существования модели по ID
    async checkModelExistsById(modelId) {
        try {
            const query = `
            SELECT COUNT() as count, any(model_name) as model_name
            FROM feature_store.ref_model 
            WHERE model_id = ${modelId} AND is_active = 1
            FORMAT JSON
        `;
            const result = await this.executeQuery(query);

            if (result && result.data && result.data[0]) {
                return {
                    exists: result.data[0].count > 0,
                    model_name: result.data[0].model_name || ''
                };
            }
            return { exists: false, model_name: '' };

        } catch (error) {
            console.error('Failed to check model existence by ID:', error);
            return { exists: false, model_name: '' };
        }
    }

    // Генерация случайного user_id
    generateRandomUserId() {
        return Math.floor(Math.random() * 1000000000); // До 1 миллиарда
    }

    // Генерация случайного user_login
    generateRandomUserLogin() {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        let result = '';
        for (let i = 0; i < 10; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Сохранение метаданных датасета
    async saveDatasetMeta(metaData) {
        try {
            const {
                dataset_meta_id,
                user_id,
                user_login,
                model_id,
                model_name,
                dataset_script,
                feature_num,
                feature_list,
                dataset_begin_dttm,
                dataset_end_dttm,
                description,
                dataset_dttm
            } = metaData;

            const featureListStr = feature_list.map(f => `'${f.replace(/'/g, "''")}'`).join(', ');

            const query = `
            INSERT INTO feature_store.dataset_meta (
                dataset_meta_id, user_id, user_login, model_id, model_name,
                dataset_script, feature_num, feature_list,
                dataset_begin_dttm, dataset_end_dttm, description, dataset_dttm
            ) VALUES (
                ${dataset_meta_id}, ${user_id}, '${user_login}', ${model_id}, '${model_name.replace(/'/g, "''")}',
                '${dataset_script.replace(/'/g, "''")}', ${feature_num}, [${featureListStr}],
                '${dataset_begin_dttm}', '${dataset_end_dttm}', ${description ? `'${description.replace(/'/g, "''")}'` : 'NULL'}, '${dataset_dttm}'
            )
        `;

            await this.executeQuery(query);
            console.log('Dataset metadata saved successfully');
            return true;

        } catch (error) {
            console.error('Failed to save dataset metadata:', error);
            throw error;
        }
    }
}

// Создаем глобальный экземпляр API
const clickhouseAPI = new ClickHouseAPI();