

Запросить список пользователей
docker exec -it clickhouse clickhouse-client --query "SHOW USERS"


Выполнить скрипт в контейнере
docker exec -it clickhouse clickhouse-client --query "CREATE TABLE test_data (id UInt32, name String) ENGINE = MergeTree() ORDER BY id"